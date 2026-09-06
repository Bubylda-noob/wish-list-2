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

function clean(v) {
  if (v == null) return "";
  return String(v)
    .replace(/&quot;/gi, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/\\"/g, '"')
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value, baseUrl) {
  const v = clean(value);
  if (!v) return "";
  try { return new URL(v, baseUrl).href; } catch { return ""; }
}

function isLikelyImage(value) {
  const v = String(value || "");
  return /^https?:\/\//i.test(v) && (/\.(jpg|jpeg|png|webp|avif|gif)(\?|#|$)/i.test(v) || /image|img|photo|picture|cdn|ozon|wildberries|wbbasket/i.test(v));
}

function usableTitle(value) {
  const t = clean(value);
  if (!t || t.length < 3) return "";
  if (/antibot|challenge|captcha|robot check|доступ ограничен|проверка браузера/i.test(t)) return "";
  if (/^(ozon|wildberries)$/i.test(t)) return "";
  return t;
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
      for (const x of all) x && Array.isArray(x["@graph"]) ? flat.push(...x["@graph"]) : flat.push(x);
      const p = flat.find(x => x && (x["@type"] === "Product" || (Array.isArray(x["@type"]) && x["@type"].includes("Product"))));
      if (p) {
        let image = p.image;
        if (Array.isArray(image)) image = image[0];
        if (image && typeof image === "object") image = image.url || image.contentUrl;
        return { title: usableTitle(p.name), description: clean(p.description), image: clean(image) };
      }
    } catch {}
  }
  return {};
}

function walkProductObject(root, depth = 0) {
  if (!root || depth > 9) return {};
  if (typeof root === "string") {
    if ((root.trim().startsWith("{") || root.trim().startsWith("[")) && root.length < 2000000) {
      try { return walkProductObject(JSON.parse(root), depth + 1); } catch {}
    }
    return {};
  }
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = walkProductObject(item, depth + 1);
      if (found.title || found.image || found.description) return found;
    }
    return {};
  }
  if (typeof root !== "object") return {};

  const type = root["@type"] || root.type || root.entityType || "";
  const typeText = Array.isArray(type) ? type.join(" ") : String(type);
  const title = usableTitle(root.name || root.title || root.productName || root.displayName || root.product?.name);
  const description = clean(root.description || root.shortDescription || root.product?.description);
  let image = root.image || root.imageUrl || root.imageURL || root.primaryImage || root.cover || root.photo || root.previewImage;
  if (Array.isArray(image)) image = image[0];
  if (image && typeof image === "object") image = image.url || image.src || image.contentUrl;
  image = clean(image);

  if ((/product|item|offer/i.test(typeText) || /product|goods|sku/i.test(JSON.stringify(root).slice(0, 500))) && (title || image || description)) {
    return { title, description, image };
  }

  for (const key of Object.keys(root)) {
    const found = walkProductObject(root[key], depth + 1);
    if (found.title || found.image || found.description) return found;
  }
  return {};
}

function parseHtml(html, baseUrl) {
  const ld = jsonLd(html);
  const embedded = walkProductObject(html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1] || "");
  const title = ld.title || embedded.title || usableTitle(meta(html, "og:title")) || usableTitle(meta(html, "twitter:title")) || usableTitle(firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]));
  const description = ld.description || embedded.description || meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description");
  const rawImage = ld.image || embedded.image || meta(html, "og:image") || meta(html, "twitter:image") || meta(html, "og:image:url");
  return { title, description: clean(description), image: absoluteUrl(rawImage, baseUrl) };
}

async function resolveUrl(url) {
  try {
    const r = await fetch(url, {
      method: "HEAD", redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WishlistProductImporter/8.0)" }
    });
    const finalUrl = new URL(r.url || url);
    if (allowed(finalUrl.hostname)) return finalUrl.href;
  } catch {}
  return url;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.7"
      }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function findFirstImage(root) {
  const candidates = [];
  const walk = (x, depth = 0) => {
    if (!x || depth > 10 || candidates.length > 20) return;
    if (typeof x === "string") {
      if (/^https?:\/\//i.test(x) && isLikelyImage(x)) candidates.push(x);
      return;
    }
    if (Array.isArray(x)) { for (const v of x) walk(v, depth + 1); return; }
    if (typeof x !== "object") return;
    for (const [k, v] of Object.entries(x)) {
      if (/image|photo|picture|media|cover|preview|url/i.test(k)) walk(v, depth + 1);
      else if (depth < 7) walk(v, depth + 1);
    }
  };
  walk(root);
  return candidates[0] || "";
}

async function wildberriesApi(url) {
  const m = url.match(/(?:catalog|product)[^\d]*(\d{5,})/i) || url.match(/(\d{6,})/);
  if (!m) throw new Error("WB product id not found");
  const nmId = m[1];
  const api = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&lang=ru&nm=${encodeURIComponent(nmId)}`;
  const data = await fetchJson(api);
  const p = data?.products?.[0] || data?.data?.products?.[0];
  if (!p) throw new Error("WB product not found");

  let image = "";
  // Current public card responses expose a numeric pics count; use the static CDN card as the reliable media source.
  const vol = Math.floor(Number(nmId) / 100000);
  const part = Math.floor(Number(nmId) / 1000);
  const path = `/vol${vol}/part${part}/${nmId}/info/ru/card.json`;
  for (let n = 1; n <= 60 && !image; n++) {
    const host = `https://basket-${String(n).padStart(2, "0")}.wbbasket.ru${path}`;
    try {
      const card = await fetchJson(host, { timeout: 6000 });
      image = findFirstImage(card);
      const description = clean(card?.description || p.description);
      return {
        title: usableTitle(p.name || card?.imt_name),
        description,
        image,
        sourceUrl: url
      };
    } catch {}
  }

  // CDN image URL fallback for the common first photo.
  if (p.pics) {
    for (let n = 1; n <= 60 && !image; n++) {
      const candidate = `https://basket-${String(n).padStart(2, "0")}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/big/1.webp`;
      try {
        const r = await fetch(candidate, { method: "HEAD", redirect: "follow" });
        if (r.ok) image = candidate;
      } catch {}
    }
  }
  return { title: usableTitle(p.name), description: clean(p.description), image, sourceUrl: url };
}

function extractOzonPath(url) {
  try {
    const u = new URL(url);
    const path = u.pathname;
    if (/\/product\//i.test(path)) return path + (u.search || "");
    return path + (u.search || "");
  } catch { return "/"; }
}

async function ozonInternalApi(url) {
  const resolved = await resolveUrl(url);
  const path = extractOzonPath(resolved);
  const encodedPath = encodeURIComponent(path);
  const endpoints = [
    `https://api.ozon.ru/composer-api.bx/page/json/v2?url=${encodedPath}`,
    `https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=${encodedPath}`
  ];
  const errors = [];
  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson(endpoint, { timeout: 15000 });
      const found = walkProductObject(data);
      const image = found.image || findFirstImage(data);
      const title = usableTitle(found.title);
      const description = clean(found.description);
      if (title || image || description) return { title, description, image: absoluteUrl(image, resolved), sourceUrl: resolved };
      errors.push("no product data");
    } catch (e) { errors.push(e.message || "error"); }
  }
  throw new Error("Ozon internal API: " + errors.join("; "));
}

async function microlink(url) {
  const params = new URLSearchParams({
    url, meta: "true", ttl: "1d",
    "data.title.selector": "meta[property='og:title']",
    "data.description.selector": "meta[property='og:description']",
    "data.image.selector": "meta[property='og:image']"
  });
  const r = await fetch("https://api.microlink.io/?" + params.toString(), { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("Microlink HTTP " + r.status);
  const j = await r.json();
  const d = j.data || {};
  const md = d.meta || {};
  return { title: usableTitle(d.title || md.title), description: clean(d.description || md.description), image: absoluteUrl(typeof d.image === "string" ? d.image : d.image?.url || md.image, url) };
}

async function directFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, { redirect: "follow", signal: controller.signal, headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"
    }});
    if (!r.ok) throw new Error("HTTP " + r.status);
    const finalUrl = new URL(r.url);
    if (!allowed(finalUrl.hostname)) throw new Error("Redirected outside allowed hosts");
    return { ...parseHtml(await r.text(), finalUrl.href), sourceUrl: finalUrl.href };
  } finally { clearTimeout(timer); }
}

function mergeData(...items) {
  const out = {};
  for (const item of items) {
    if (!item) continue;
    if (!out.title && usableTitle(item.title)) out.title = usableTitle(item.title);
    if (!out.description && item.description) out.description = clean(item.description);
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
  try { input = new URL(raw); } catch { return res.status(400).json({ error: "Некорректная ссылка." }); }
  if (!["http:", "https:"].includes(input.protocol) || !allowed(input.hostname)) {
    return res.status(400).json({ error: "Поддерживаются Ozon, Wildberries, Детский мир и OZ." });
  }

  const store = storeFor(input.hostname);
  const results = [];
  const errors = [];

  // Marketplace-specific APIs are tried FIRST. This avoids saving Ozon/WB anti-bot pages as product data.
  if (store === "wildberries") {
    try { results.push(await wildberriesApi(input.href)); } catch (e) { errors.push("wb-api: " + (e.message || "error")); }
  }
  if (store === "ozon") {
    try { results.push(await ozonInternalApi(input.href)); } catch (e) { errors.push("ozon-api: " + (e.message || "error")); }
  }

  let merged = mergeData(...results);
  if (!merged.title || !merged.image || !merged.description) {
    try { results.push(await microlink(input.href)); } catch (e) { errors.push("metadata: " + (e.message || "error")); }
    merged = mergeData(...results);
  }
  if (!merged.title || !merged.image) {
    try { results.push(await directFetch(input.href)); } catch (e) { errors.push("direct: " + (e.message || "error")); }
    merged = mergeData(...results);
  }

  const sourceUrl = merged.sourceUrl || input.href;
  const hasUsefulData = Boolean(merged.title || merged.image || merged.description);
  if (!hasUsefulData) {
    return res.status(502).json({
      error: `Не удалось получить данные товара с ${store === "ozon" ? "Ozon" : store === "wildberries" ? "Wildberries" : "этого магазина"}.`,
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
    reader: store === "wildberries" ? "wb-public-card-api" : store === "ozon" ? "ozon-internal-api" : "multi-source"
  });
};
