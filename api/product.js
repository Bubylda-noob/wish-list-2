const ALLOWED_HOSTS = [
  "ozon.ru", "ozon.by",
  "wildberries.ru", "wildberries.by",
  "detmir.ru", "detmir.by",
  "oz.by"
];

function allowed(hostname) {
  const h = hostname.toLowerCase();
  return ALLOWED_HOSTS.some(x => h === x || h.endsWith("." + x));
}

function clean(v) {
  return String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i");
  return clean((html.match(a) || html.match(b) || [,""])[1]);
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
        if (image && typeof image === "object") image = image.url;
        return {title:clean(p.name), description:clean(p.description), image:clean(image)};
      }
    } catch {}
  }
  return {};
}

async function microlink(url) {
  const endpoint = "https://api.microlink.io/?url=" + encodeURIComponent(url) +
    "&meta=true&data.title.selector=title&data.description.selector=meta[name='description']";
  const r = await fetch(endpoint, {
    headers: { "Accept": "application/json", "User-Agent": "Wishlist/3.0" }
  });
  if (!r.ok) throw new Error("Microlink HTTP " + r.status);
  const j = await r.json();
  const d = j.data || {};
  return {
    title: clean(d.title),
    description: clean(d.description),
    image: clean(typeof d.image === "string" ? d.image : d.image?.url)
  };
}

async function directFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(url, {
      redirect:"follow",
      signal:controller.signal,
      headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept":"text/html,application/xhtml+xml"
      }
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const finalUrl = new URL(r.url);
    if (!allowed(finalUrl.hostname)) throw new Error("Redirected outside allowed hosts");
    const html = await r.text();
    const ld = jsonLd(html);
    return {
      title: ld.title || meta(html,"og:title") || clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[,""])[1]),
      description: ld.description || meta(html,"og:description") || meta(html,"description"),
      image: ld.image || meta(html,"og:image") || meta(html,"twitter:image"),
      sourceUrl: finalUrl.href
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({error:"Method not allowed"});

  const raw = req.query && req.query.url;
  if (!raw) return res.status(400).json({error:"Не передана ссылка на товар."});

  let input;
  try { input = new URL(raw); } catch {
    return res.status(400).json({error:"Некорректная ссылка."});
  }

  if (!["http:","https:"].includes(input.protocol) || !allowed(input.hostname)) {
    return res.status(400).json({error:"Поддерживаются Ozon, Wildberries, Детский мир и OZ."});
  }

  let data = {};
  let microlinkError = "";

  try {
    data = await microlink(input.href);
  } catch (e) {
    microlinkError = e.message || "Microlink error";
  }

  if (!data.title && !data.image && !data.description) {
    try {
      data = await directFetch(input.href);
    } catch (e) {
      return res.status(502).json({
        error:"Магазин не отдал данные товара. Возможно, сработала антибот-защита. Попробуй кнопку «Обновить данные» ещё раз позже."
      });
    }
  }

  if (!data.title && !data.image && !data.description) {
    return res.status(422).json({error:"Не удалось найти данные товара."});
  }

  return res.status(200).json({
    title:data.title || "Товар",
    description:data.description || "",
    image:data.image || "",
    sourceUrl:input.href,
    reader:microlinkError ? "direct" : "microlink"
  });
};
