const INITIAL_PRODUCTS = [
  {url:"https://ozon.by/t/9oSz2kd"},
  {url:"https://ozon.by/t/j7F5gzy"},
  {url:"https://ozon.by/t/ukiY9v9"},
  {url:"https://www.wildberries.by/catalog/1175385664/detail.aspx?size=1731541956"},
  {url:"https://oz.by/childrensbooks/more10251857.html"},
  {url:"https://www.wildberries.by/catalog/281711487/detail.aspx?size=432187138"},
  {url:"https://detmir.by/product/index/id/589041/"},
  {url:"https://detmir.by/product/index/id/3156059/"},
  {url:"https://detmir.by/product/index/id/6678670/"},
  {url:"https://detmir.by/product/index/id/6687521/"},
  {url:"https://detmir.by/product/index/id/3156071/"}
];

const key = "arinaWishlistV3";
const oldKeys = ["arinaWishlistV2", "arinaWishlistV1"];
let products = JSON.parse(localStorage.getItem(key) || "null");
let activeId = null;

if (!products) {
  let old = null;
  for (const k of oldKeys) {
    try {
      old = JSON.parse(localStorage.getItem(k) || "null");
      if (old) break;
    } catch {}
  }
  products = old || INITIAL_PRODUCTS.map(p => ({...p}));
  products = products.map(p => ({
    id: p.id || crypto.randomUUID(),
    url: p.url || "",
    title: p.title || "",
    description: p.description || "",
    image: p.image || ""
  }));
  save();
}

function save() {
  localStorage.setItem(key, JSON.stringify(products));
}

function storeName(url, manualStore = "") {
  if (manualStore) return manualStore;
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h.includes("ozon")) return "Ozon";
    if (h.includes("wildberries")) return "Wildberries";
    if (h.includes("detmir")) return "Детский мир";
    if (h.includes("oz.by")) return "OZ";
    return h;
  } catch { return "Магазин"; }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}

function imageHtml(p) {
  if (!p.image) {
    return `<div class="no-image"><span>🖼️</span><small>Фото не получено</small></div>`;
  }
  return `<img class="card-img" src="${esc(p.image)}" alt="" loading="lazy"
    onerror="this.closest('.card').querySelector('.card-img').outerHTML='<div class=&quot;no-image&quot;><span>🖼️</span><small>Фото недоступно</small></div>'">`;
}

function render() {
  const q = document.getElementById("search").value.toLowerCase().trim();
  const list = products.filter(p =>
    (p.title + " " + p.description + " " + storeName(p.url, p.manualStore))
      .toLowerCase().includes(q)
  );

  document.getElementById("count").textContent = products.length;
  document.getElementById("empty").classList.toggle("hidden", list.length !== 0);

  document.getElementById("grid").innerHTML = list.map(p => `
    <article class="card" data-id="${esc(p.id)}">
      <div class="card-media">${imageHtml(p)}</div>
      <div class="card-body">
        <div class="card-store">${esc(storeName(p.url, p.manualStore))}</div>
        <div class="card-title">${esc(p.title || "Данные товара ещё не получены")}</div>
        <div class="card-open">Открыть карточку →</div>
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".card").forEach(c =>
    c.onclick = () => openView(c.dataset.id)
  );
}

function setStatus(text, type = "") {
  const el = document.getElementById("syncStatus");
  el.textContent = text;
  el.className = "sync-status " + type;
}

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}

function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}

function openView(id) {
  activeId = id;
  const p = products.find(x => x.id === id);
  if (!p) return;

  const wrap = document.getElementById("viewImageWrap");
  wrap.innerHTML = p.image
    ? `<img id="viewImage" class="view-image" src="${esc(p.image)}" alt="">`
    : `<div class="view-no-image">Фото товара не получено</div>`;

  document.getElementById("viewTitle").textContent =
    p.title || "Данные товара ещё не получены";
  document.getElementById("viewDesc").textContent =
    p.description || "Описание не получено.";
  document.getElementById("viewStore").textContent = storeName(p.url, p.manualStore);

  const link = document.getElementById("viewLink");
  link.href = p.url;
  link.onclick = () => {
    // Надёжно открываем исходную страницу в новой вкладке.
    window.open(p.url, "_blank", "noopener,noreferrer");
    return false;
  };

  openModal("viewModal");
}

async function fetchProduct(url) {
  const response = await fetch("/api/product?url=" + encodeURIComponent(url), {
    headers: { "Accept": "application/json" },
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось получить данные товара.");
  return data;
}

async function refreshOne(p) {
  const data = await fetchProduct(p.url);
  if (data.title) p.title = data.title;
  if (data.description) p.description = data.description;
  if (data.image) p.image = data.image;
  if (data.sourceUrl) p.url = data.sourceUrl;
  return p;
}

async function refreshAll() {
  const btn = document.getElementById("refreshAll");
  btn.disabled = true;
  setStatus("обновляю…");

  let ok = 0, failed = 0;
  for (const p of products) {
    if (!p.url || p.manualStore) continue;
    try {
      await refreshOne(p);
      ok++;
      save();
      render();
    } catch {
      failed++;
    }
  }

  btn.disabled = false;
  if (failed) {
    setStatus(`готово: ${ok}, не удалось: ${failed}`, "warn");
  } else {
    setStatus(`обновлено: ${ok}`, "ok");
  }
  save();
  render();
}

function setLoading(isLoading) {
  const btn = document.getElementById("saveProduct");
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Получаю данные товара…" : "Добавить в вишлист";
}

document.getElementById("openAdd").onclick = () => {
  openModal("addModal");
  showAddMode("auto");
};
document.getElementById("refreshAll").onclick = refreshAll;

function showAddMode(mode) {
  const auto = mode === "auto";
  document.getElementById("autoForm").classList.toggle("hidden", !auto);
  document.getElementById("manualForm").classList.toggle("hidden", auto);
  document.getElementById("autoTab").classList.toggle("active", auto);
  document.getElementById("manualTab").classList.toggle("active", !auto);
}
document.getElementById("autoTab").onclick = () => showAddMode("auto");
document.getElementById("manualTab").onclick = () => showAddMode("manual");
document.getElementById("search").oninput = render;

document.querySelectorAll("[data-close]").forEach(b =>
  b.onclick = () => closeModal(b.dataset.close)
);

document.querySelectorAll(".modal").forEach(m =>
  m.onclick = e => { if (e.target === m) closeModal(m.id); }
);

document.getElementById("saveProduct").onclick = async () => {
  const url = document.getElementById("urlInput").value.trim();
  const error = document.getElementById("addError");
  const titleManual = document.getElementById("titleInput").value.trim();
  const imageManual = document.getElementById("imageInput").value.trim();
  const descManual = document.getElementById("descInput").value.trim();
  error.textContent = "";

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    error.textContent = "Введи корректную ссылку на товар.";
    return;
  }

  setLoading(true);

  try {
    let data = {};
    try {
      data = await fetchProduct(url);
    } catch (apiError) {
      // Если пользователь заполнил ручные поля, разрешаем ручное добавление.
      if (!titleManual && !imageManual && !descManual) throw apiError;
    }

    products.unshift({
      id: crypto.randomUUID(),
      url,
      title: data.title || titleManual || "Новый подарок",
      image: data.image || imageManual || "",
      description: data.description || descManual || ""
    });

    save();
    render();
    closeModal("addModal");

    ["urlInput", "titleInput", "imageInput", "descInput"].forEach(id =>
      document.getElementById(id).value = ""
    );
    document.getElementById("autoStatus").textContent = "";
  } catch (e) {
    error.textContent = e.message || "Не удалось получить данные товара.";
  } finally {
    setLoading(false);
  }
};

document.getElementById("addManual").onclick = () => {
  const url = document.getElementById("manualUrlInput").value.trim();
  const store = document.getElementById("manualStore").value;
  const title = document.getElementById("manualTitle").value.trim();
  const image = document.getElementById("manualImage").value.trim();
  const description = document.getElementById("manualDesc").value.trim();
  const error = document.getElementById("manualError");
  error.textContent = "";

  if (!title) {
    error.textContent = "Укажи название товара.";
    return;
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    error.textContent = "Укажи корректную ссылку на товар.";
    return;
  }

  if (image) {
    try {
      const parsedImage = new URL(image);
      if (!["http:", "https:"].includes(parsedImage.protocol)) throw new Error();
    } catch {
      error.textContent = "Ссылка на фото должна начинаться с http:// или https://.";
      return;
    }
  }

  products.unshift({
    id: crypto.randomUUID(),
    url,
    title,
    image,
    description,
    manualStore: store
  });

  save();
  render();
  closeModal("addModal");

  ["manualUrlInput", "manualTitle", "manualImage", "manualDesc"].forEach(id => {
    document.getElementById(id).value = "";
  });
};

document.getElementById("deleteProduct").onclick = () => {
  if (!activeId) return;
  products = products.filter(p => p.id !== activeId);
  save();
  render();
  closeModal("viewModal");
};

render();

// ВАЖНО: старые карточки автоматически обновляются при загрузке.
// Раньше проект этого не делал, поэтому у пользователя оставались заглушки.
setTimeout(refreshAll, 250);
