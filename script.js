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

const fallbackImages = [
  "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=900&q=80"
];

const key = "arinaWishlistV2";
const oldKey = "arinaWishlistV1";
let products = JSON.parse(localStorage.getItem(key) || "null");

if (!products) {
  const old = JSON.parse(localStorage.getItem(oldKey) || "null");
  products = old || INITIAL_PRODUCTS.map((p, i) => ({
    ...p,
    id: crypto.randomUUID(),
    title: "",
    description: "",
    image: ""
  }));
  save();
}

let activeId = null;

function save() {
  localStorage.setItem(key, JSON.stringify(products));
}

function storeName(url) {
  try {
    const h = new URL(url).hostname.replace("www.", "");
    if (h.includes("ozon")) return "Ozon";
    if (h.includes("wildberries")) return "Wildberries";
    if (h.includes("detmir")) return "Детский мир";
    if (h.includes("oz.by")) return "OZ";
    return h;
  } catch {
    return "Магазин";
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}

function productImage(p, i = 0) {
  return p.image || fallbackImages[i % fallbackImages.length];
}

function render() {
  const q = document.getElementById("search").value.toLowerCase().trim();
  const list = products.filter(p =>
    (p.title + " " + p.description + " " + storeName(p.url))
      .toLowerCase().includes(q)
  );

  document.getElementById("count").textContent = products.length;
  document.getElementById("empty").classList.toggle("hidden", list.length !== 0);
  document.getElementById("grid").innerHTML = list.map((p, i) => `
    <article class="card" data-id="${esc(p.id)}">
      <img class="card-img" src="${esc(productImage(p, i))}" alt="" loading="lazy"
           onerror="this.src='${fallbackImages[0]}'">
      <div class="card-body">
        <div class="card-store">${esc(storeName(p.url))}</div>
        <div class="card-title">${esc(p.title || "Без названия")}</div>
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".card").forEach(c =>
    c.onclick = () => openView(c.dataset.id)
  );
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

  document.getElementById("viewImage").src = productImage(p);
  document.getElementById("viewTitle").textContent = p.title || "Без названия";
  document.getElementById("viewDesc").textContent = p.description || "Описание не найдено.";
  document.getElementById("viewStore").textContent = storeName(p.url);
  document.getElementById("viewLink").href = p.url;
  openModal("viewModal");
}

async function fetchProduct(url) {
  const response = await fetch("/api/product?url=" + encodeURIComponent(url), {
    headers: { "Accept": "application/json" }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Не удалось получить данные товара.");
  }
  return data;
}

function setLoading(isLoading) {
  const btn = document.getElementById("saveProduct");
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Получаю данные товара…" : "Добавить в вишлист";
}

document.getElementById("openAdd").onclick = () => openModal("addModal");

document.querySelectorAll("[data-close]").forEach(b =>
  b.onclick = () => closeModal(b.dataset.close)
);

document.querySelectorAll(".modal").forEach(m =>
  m.onclick = e => {
    if (e.target === m) closeModal(m.id);
  }
);

document.getElementById("search").oninput = render;

document.getElementById("urlInput").addEventListener("paste", () => {
  setTimeout(async () => {
    const url = document.getElementById("urlInput").value.trim();
    if (!url) return;
    const hint = document.getElementById("autoStatus");
    hint.textContent = "Ссылка вставлена — можно нажать «Добавить в вишлист».";
  }, 50);
});

document.getElementById("saveProduct").onclick = async () => {
  const url = document.getElementById("urlInput").value.trim();
  const error = document.getElementById("addError");
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
    const data = await fetchProduct(url);

    products.unshift({
      id: crypto.randomUUID(),
      url,
      title: data.title || "Новый подарок",
      image: data.image || "",
      description: data.description || ""
    });

    save();
    render();
    closeModal("addModal");

    ["urlInput", "titleInput", "imageInput", "descInput"].forEach(id => {
      document.getElementById(id).value = "";
    });
    document.getElementById("autoStatus").textContent = "";
  } catch (e) {
    error.textContent =
      e.message ||
      "Не удалось автоматически получить товар. Магазин мог заблокировать запрос.";
  } finally {
    setLoading(false);
  }
};

document.getElementById("deleteProduct").onclick = () => {
  if (!activeId) return;
  products = products.filter(p => p.id !== activeId);
  save();
  render();
  closeModal("viewModal");
};

render();
