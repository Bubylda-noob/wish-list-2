const ALLOWED_HOSTS = [
  "ozon.ru", "ozon.by",
  "wildberries.ru", "wildberries.by",
  "detmir.ru", "detmir.by",
  "oz.by"
];

const STORE_NAMES = {
  ozon: /(^|\.)ozon\.(ru|by)$/i,
  wildberries: /(^|\.)wildberries\.(ru|by)$/i,
  detmir: /(^|\.)detmir\.(ru|by)$/i,
  oz: /(^|\.)oz\.by$/i
};

function allowed(hostname) {
  const h = String(hostname || "").toLowerCase();
  return ALLOWED_HOSTS.some(x => h === x || h.endsWith("." + x));
}

function storeFor(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (STORE_NAMES.ozon.test(h)) return "ozon";
  if (STORE_NAMES.wildberries.test(h)) return "wildberries";
  if (STORE_NAMES.detmir.test(h)) return "detmir";
  if (STORE_NAMES.oz.test(h)) return "oz";
  return "unknown";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function clean(v) {
  if (v == null) return "";
  return decodeHtml(String(v))
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  const v = clean(value);
  if (!v) return "";
  try {
    return new URL(v, baseUrl).href;
  } catch {
    return "";
  }
}

function isLikelyImage(value) {
  const v = String(value || "");
  if (!/^https?:\/\//i.test(v)) return false;
  if (/\.(jpg|jpeg|png|webp|avif|gif)(\?|#|$)/i.test(v)) return true;
  return /image|img|photo|picture|cdn|ozon|wildberries/i.test(v);
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i");
  return clean((html.match(a) || html.match(b) || [, ""])[1]);
}

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return clean(m[1]);
  }
  return "";
}

function jsonLd(html) {
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const all = Array.isArray(parsed) ? parsed : [parsed];
      const flat = [];
      for (const x of all) {
        if (x && Array.isArray(x["@graph"])) flat.push(...x["@graph"]);
        else flat.push(x);
      }
      const p = flat.find(x => x && (x["@type"] === "Product" ||
        (Array.isArray(x["@type"]) && x["@type"].includes("Product"))));
      if (p) {
        let image = p.image;
        if (Array.isArray(image)) image = image[0];
        if (image && typeof image === "object") image = image.url || image.contentUrl;
        return {
          title: clean(p.name),
          description: clean(p.description),
          image: clean(image)
        };
      }
    } catch {}
  }
  return {};
}

function walkProductObject(root, depth = 0) {
  if (!root || depth > 7) return {};
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = walkProductObject(item, depth + 1);
      if (found.title || found.image) return found;
    }
    return {};
  }
  if (typeof root !== "object") return {};

  const type = root["@type"] || root.type || root.entityType || "";
  const typeText = Array.isArray(type) ? type.join(" ") : String(type);
  const title = root.name || root.title || root.productName || root.displayName;
  const image = root.image || root.imageUrl || root.imageURL || root.primaryImage || root.cover || root.photo;
  const description = root.description || root.shortDescription;

  if ((/product|item|offer/i.test(typeText) || /product/i.test(JSON.stringify(root).slice(0, 300))) && (title || image)) {
    let imageValue = image;
    if (Array.isArray(imageValue)) imageValue = imageValue[0];
    if (imageValue && typeof imageValue === "object") imageValue = imageValue.url || imageValue.src || imageValue.contentUrl;
    return {
      title: clean(title),
      description: clean(description),
      image: clean(imageValue)
    };
  }

  for (const key of Object.keys(root)) {
    const found = walkProductObject(root[key], depth + 1);
    if (found.title || found.image) return found;
  }
  return {};
}

function embeddedProductData(html) {
  // Next.js / React state commonly contains the same product data that the browser renders.
  const scriptBlocks = [
    ...html.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi),
    ...html.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)
  ];

  for (const m of scriptBlocks) {
    try {
      const parsed = JSON.parse(decodeHtml(m[1].trim()));
      const found = walkProductObject(parsed);
      if (found.title || found.image) return found;
    } catch {}
  }

  // Last-resort patterns for minified store JSON.
  const title = firstMatch(html, [
    /["'](?:productName|productTitle|displayName|name)["']\s*:\s*["']([^"']{4,300})["']/i,
    /["'](?:title)["']\s*:\s*["']([^"']{4,300})["']/i
  ]);
  const image = firstMatch(html, [
    /["'](?:imageUrl|imageURL|primaryImage|image|src)["']\s*:\s*["'](https?:\\?\/\\?\/[^"']+)["']/i
  ]);

  if (title || image) return { title, image };
  return {};
}

function parseHtml(html, baseUrl) {
  const ld = jsonLd(html);
  const embedded = embeddedProductData(html);
  const title = ld.title || embedded.title ||
    meta(html, "og:title") || meta(html, "twitter:title") ||
    firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const description = ld.description || embedded.description ||
    meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description");
  const rawImage = ld.image || embedded.image ||
    meta(html, "og:image") || meta(html, "twitter:image") || meta(html, "og:image:url");

  return {
    title: clean(title),
    description: clean(description),
    image: absoluteUrl(rawImage, baseUrl)
  };
}

async function microlink(url) {
  const params = new URLSearchParams({
    url,
    meta: "true",
    ttl: "1d",
    "data.title.selector": "meta[property='og:title']",
    "data.description.selector": "meta[property='og:description']",
    "data.image.selector": "meta[property='og:image']"
  });
  const endpoint = "https://api.microlink.io/?" + params.toString();
  const r = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; WishlistProductImporter/5.0)"
    }
  });
  if (!r.ok) throw new Error("Microlink HTTP " + r.status);
  const j = await r.json();
  const d = j.data || {};
  const metaData = j.data?.meta || {};
  return {
    title: clean(d.title || metaData.title),
    description: clean(d.description || metaData.description),
    image: absoluteUrl(
      typeof d.image === "string" ? d.image : d.image?.url || metaData.image,
      url
    )
  };
}

async function microlinkHtml(url) {
  const params = new URLSearchParams({
    url,
    ttl: "1d",
    "data.html.selector": "html"
  });
  const endpoint = "https://api.microlink.io/?" + params.toString();
  const r = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; WishlistProductImporter/5.0)"
    }
  });
  if (!r.ok) throw new Error("Microlink HTML HTTP " + r.status);
  const j = await r.json();
  const htmlData = j.data?.html;
  const html = typeof htmlData === "string" ? htmlData : htmlData?.value;
  if (!html) throw new Error("Microlink did not return rendered HTML");
  return parseHtml(html, url);
}

async function directFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: "https://www.google.com/"
      }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const finalUrl = new URL(r.url);
    if (!allowed(finalUrl.hostname)) throw new Error("Redirected outside allowed hosts");
    const html = await r.text();
    return { ...parseHtml(html, finalUrl.href), sourceUrl: finalUrl.href };
  } finally {
    clearTimeout(timer);
  }
}

function mergeData(...items) {
  const out = {};
  for (const item of items) {
    if (!item) continue;
    if (!out.title && item.title) out.title = item.title;
    if (!out.description && item.description) out.description = item.description;
    if (!out.image && item.image && isLikelyImage(item.image)) out.image = item.image;
    if (!out.sourceUrl && item.sourceUrl) out.sourceUrl = item.sourceUrl;
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = req.query && req.query.url;
  if (!raw) return res.status(400).json({ error: "Не передана ссылка на товар." });

  let input;
  try { input = new URL(raw); } catch {
    return res.status(400).json({ error: "Некорректная ссылка." });
  }

  if (!["http:", "https:"].includes(input.protocol) || !allowed(input.hostname)) {
    return res.status(400).json({ error: "Поддерживаются Ozon, Wildberries, Детский мир и OZ." });
  }

  const store = storeFor(input.hostname);
  const results = [];
  const errors = [];

  // 1. Normalized metadata through a real browser (best chance for JS-heavy Ozon/WB pages).
  try { results.push(await microlink(input.href)); }
  catch (e) { errors.push("metadata: " + (e.message || "error")); }

  // 2. Ask the same browser service for fully rendered HTML when metadata is incomplete.
  let merged = mergeData(...results);
  if (!merged.title || !merged.image) {
    try { results.push(await microlinkHtml(input.href)); }
    catch (e) { errors.push("html: " + (e.message || "error")); }
    merged = mergeData(...results);
  }

  // 3. Direct server fetch as a final independent parser.
  if (!merged.title || !merged.image) {
    try { results.push(await directFetch(input.href)); }
    catch (e) { errors.push("direct: " + (e.message || "error")); }
    merged = mergeData(...results);
  }

  const sourceUrl = merged.sourceUrl || input.href;
  const hasUsefulData = Boolean(merged.title || merged.image || merged.description);

  if (!hasUsefulData) {
    return res.status(502).json({
      error: `Не удалось получить данные товара с ${store === "ozon" ? "Ozon" : store === "wildberries" ? "Wildberries" : "этого магазина"}. Магазин, вероятно, не отдаёт данные автоматическому запросу. Попробуй ещё раз через несколько секунд.`,
      store,
      debug: process.env.NODE_ENV === "development" ? errors : undefined
    });
  }

  return res.status(200).json({
    title: merged.title || "Товар",
    description: merged.description || "",
    image: merged.image || "",
    sourceUrl,
    store,
    reader: results.length > 1 ? "multi-source" : "microlink"
  });
};
