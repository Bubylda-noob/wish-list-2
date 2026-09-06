const ALLOWED_HOSTS = [
  "ozon.ru", "ozon.by",
  "wildberries.ru", "wildberries.by",
  "detmir.ru", "detmir.by",
  "oz.by"
];

function isAllowedHost(hostname) {
  const h = hostname.toLowerCase();
  return ALLOWED_HOSTS.some(base => h === base || h.endsWith("." + base));
}

function decodeHtml(value = "") {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .trim();
}

function clean(value = "") {
  return decodeHtml(String(value))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    "i"
  );
  return clean((html.match(re) || html.match(re2) || [,""])[1]);
}

function jsonLdProducts(html) {
  const scripts = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )];

  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1].trim());
      const items = Array.isArray(data) ? data : [data];
      const flat = [];

      for (const item of items) {
        if (item && Array.isArray(item["@graph"])) flat.push(...item["@graph"]);
        else flat.push(item);
      }

      const product = flat.find(x => x && (
        x["@type"] === "Product" ||
        (Array.isArray(x["@type"]) && x["@type"].includes("Product"))
      ));

      if (product) {
        let image = product.image;
        if (Array.isArray(image)) image = image[0];
        if (image && typeof image === "object") image = image.url;

        return {
          title: clean(product.name),
          description: clean(product.description),
          image: clean(image || "")
        };
      }
    } catch (_) {}
  }
  return {};
}

function firstImage(html) {
  return meta(html, "og:image") ||
    meta(html, "twitter:image") ||
    ((html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i) || [,""])[1]);
}

function normalizeImage(url, base) {
  if (!url) return "";
  try { return new URL(url, base).href; } catch { return ""; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({error:"Method not allowed"});

  const raw = req.query?.url;
  if (!raw || typeof raw !== "string") {
    return res.status(400).json({error:"Не передана ссылка на товар."});
  }

  let input;
  try {
    input = new URL(raw);
  } catch {
    return res.status(400).json({error:"Некорректная ссылка."});
  }

  if (!["http:", "https:"].includes(input.protocol) || !isAllowedHost(input.hostname)) {
    return res.status(400).json({
      error:"Поддерживаются ссылки только на Ozon, Wildberries, Детский мир и OZ."
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(input.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WishlistProductReader/2.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    clearTimeout(timeout);

    const finalUrl = new URL(response.url);
    if (!isAllowedHost(finalUrl.hostname)) {
      return res.status(400).json({error:"Ссылка перенаправила на неподдерживаемый домен."});
    }

    if (!response.ok) {
      return res.status(502).json({error:`Магазин вернул ошибку HTTP ${response.status}.`});
    }

    const html = await response.text();
    const ld = jsonLdProducts(html);

    const title = ld.title || meta(html, "og:title") ||
      clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,""])[1]);

    const description = ld.description || meta(html, "og:description") ||
      meta(html, "description");

    const image = normalizeImage(
      ld.image || firstImage(html),
      finalUrl.href
    );

    if (!title && !image && !description) {
      return res.status(422).json({
        error:"Магазин не отдал данные товара. Возможно, сработала антибот-защита."
      });
    }

    return res.status(200).json({
      title: title || "Товар",
      image,
      description: description || "",
      sourceUrl: finalUrl.href
    });
  } catch (err) {
    const message = err?.name === "AbortError"
      ? "Магазин не ответил вовремя."
      : "Не удалось получить страницу товара. Магазин мог заблокировать автоматический запрос.";
    return res.status(502).json({error: message});
  }
}
