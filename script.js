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

const LOCAL_KEY = "arinaWishlistV3";
const MIGRATION_KEY = "arinaWishlistSupabaseMigrationV1";
let products = [];
let activeId = null;
let supabase = null;
let realtimeChannel = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
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

function imageHtml(p) {
  if (!p.image) {
    return `<div class="no-image"><span>🖼️</span><small>Фото не получено</small></div>`;
  }
  return `<img class="card-img" src="${esc(p.image)}" alt="" loading="lazy"
    onerror="this.outerHTML='<div class=&quot;no-image&quot;><span>🖼️</span><small>Фото недоступно</small></div>'">`;
}

function render() {
  const search = document.getElementById("search");
  const q = (search?.value || "").toLowerCase().trim();
  const list = products.filter(p =>
    (p.title + " " + p.description + " " + storeName(p.url, p.manual_store || p.manualStore))
      .toLowerCase().includes(q)
  );

  document.getElementById("count").textContent = products.length;
  document.getElementById("empty").classList.toggle("hidden", list.length !== 0);

  document.getElementById("grid").innerHTML = list.map(p => `
    <article class="card ${p.reserved ? "is-reserved" : ""}" data-id="${esc(p.id)}">
      <div class="card-media">
        ${imageHtml(p)}
        <button class="reserve-btn ${p.reserved ? "active" : ""}"
          data-reserve-id="${esc(p.id)}" type="button" aria-pressed="${p.reserved}">
          ${p.reserved ? "✓ Забронировано" : "Отметить забронированным"}
        </button>
      </div>
      <div class="card-body">
        <div class="card-store">${esc(storeName(p.url, p.manual_store || p.manualStore))}</div>
        <div class="card-title">${esc(p.title || "Данные товара ещё не получены")}</div>
        <div class="card-open">Открыть карточку →</div>
      </div>
    </article>
  `).join("");

  document.querySelectorAll(".card").forEach(c => c.onclick = e => {
    if (e.target.closest(".reserve-btn")) return;
    openView(c.dataset.id);
  });

  document.querySelectorAll(".reserve-btn").forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    toggleReserved(btn.dataset.reserveId);
  });
}

function setStatus(text, type = "") {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = text;
  el.className = "sync-status " + type;
}

function openModal(id) { document.getElementById(id).classList.remove("hidden"); }
function closeModal(id) { document.getElementById(id).classList.add("hidden"); }

function updateViewReservation(p) {
  const btn = document.getElementById("toggleReserved");
  if (!btn) return;
  btn.textContent = p.reserved ? "✓ Забронировано" : "Отметить как забронированное";
  btn.classList.toggle("active", Boolean(p.reserved));
  btn.setAttribute("aria-pressed", String(Boolean(p.reserved)));
}

function openView(id) {
  activeId = id;
  const p = products.find(x => x.id === id);
  if (!p) return;

  document.getElementById("viewImageWrap").innerHTML = p.image
    ? `<img id="viewImage" class="view-image" src="${esc(p.image)}" alt="">`
    : `<div class="view-no-image">Фото товара не получено</div>`;

  document.getElementById("viewTitle").textContent = p.title || "Данные товара ещё не получены";
  document.getElementById("viewDesc").textContent = p.description || "Описание не получено.";
  document.getElementById("viewStore").textContent = storeName(p.url, p.manual_store || p.manualStore);
  updateViewReservation(p);

  const link = document.getElementById("viewLink");
  link.href = p.url;
  link.onclick = () => {
    window.open(p.url, "_blank", "noopener,noreferrer");
    return false;
  };

  openModal("viewModal");
}

function localProducts() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => p && p.url).map(p => ({
      url: p.url,
      title: p.title || "",
      description: p.description || "",
      image: p.image || "",
      manual_store: p.manual_store || p.manualStore || "",
      reserved: Boolean(p.reserved)
    }));
  } catch { return []; }
}

function saveLocalCache() {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(products)); } catch {}
}

async function initSupabase() {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.url || !cfg.anonKey || cfg.url.includes("YOUR-PROJECT") || cfg.anonKey.includes("YOUR_PUBLISHABLE")) {
    supabase = null;
    return false;
  }
  if (!window.supabase?.createClient) {
    supabase = null;
    return false;
  }
  try {
    supabase = window.supabase.createClient(cfg.url, cfg.anonKey);
    return true;
  } catch (e) {
    console.warn("Supabase disabled:", e);
    supabase = null;
    return false;
  }
}

function normalizeRow(row) {
  return {
    id: row.id,
    url: row.url || "",
    title: row.title || "",
    description: row.description || "",
    image: row.image || "",
    manual_store: row.manual_store || "",
    reserved: Boolean(row.reserved),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function loadProducts() {
  if (!supabase) {
    products = localProducts().map((p, i) => ({
      id: p.id || "local-" + i + "-" + btoa(unescape(encodeURIComponent(p.url))).slice(0, 12),
      url: p.url,
      title: p.title,
      description: p.description,
      image: p.image,
      manual_store: p.manual_store,
      reserved: p.reserved,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || new Date().toISOString()
    }));
    if (!products.length) {
      products = INITIAL_PRODUCTS.map((p, i) => ({
        id: "local-initial-" + i,
        url: p.url, title: "", description: "", image: "", manual_store: "", reserved: false,
        created_at: new Date(Date.now() + i).toISOString(), updated_at: new Date().toISOString()
      }));
      saveLocalCache();
    }
    return;
  }
  const { data, error } = await supabase
    .from("wishlist_products")
    .select("id,url,title,description,image,manual_store,reserved,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  products = (data || []).map(normalizeRow);
  saveLocalCache();
}

async function migrateLocalProducts() {
  if (!supabase) return;
  if (localStorage.getItem(MIGRATION_KEY)) return;

  const old = localProducts();
  if (!old.length) {
    localStorage.setItem(MIGRATION_KEY, "1");
    return;
  }

  const existing = new Set(products.map(p => p.url));
  let added = 0;

  for (const p of old) {
    if (!p.url || existing.has(p.url)) continue;
    const { error } = await supabase.from("wishlist_products").insert({
      url: p.url,
      title: p.title,
      description: p.description,
      image: p.image,
      manual_store: p.manual_store,
      reserved: p.reserved
    });
    if (!error) {
      added++;
      existing.add(p.url);
    }
  }

  // Если старый браузер уже содержал данные для стартовых ссылок,
  // аккуратно переносим только пустые поля, не перезаписывая общую бронь.
  for (const oldProduct of old) {
    const current = products.find(p => p.url === oldProduct.url);
    if (!current) continue;
    const patch = {};
    if (!current.title && oldProduct.title) patch.title = oldProduct.title;
    if (!current.description && oldProduct.description) patch.description = oldProduct.description;
    if (!current.image && oldProduct.image) patch.image = oldProduct.image;
    if (!current.manual_store && oldProduct.manual_store) patch.manual_store = oldProduct.manual_store;
    if (Object.keys(patch).length) {
      await supabase.from("wishlist_products").update(patch).eq("id", current.id);
    }
  }

  localStorage.setItem(MIGRATION_KEY, "1");
  if (added) await loadProducts();
}

function subscribeRealtime() {
  if (!supabase) { setStatus("офлайн · данные только на этом устройстве", "warn"); return; }
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);

  realtimeChannel = supabase
    .channel("wishlist-products-live")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "wishlist_products"
    }, payload => {
      if (payload.eventType === "INSERT") {
        const incoming = normalizeRow(payload.new);
        if (!products.some(p => p.id === incoming.id)) products.push(incoming);
      } else if (payload.eventType === "UPDATE") {
        const incoming = normalizeRow(payload.new);
        const index = products.findIndex(p => p.id === incoming.id);
        if (index >= 0) products[index] = incoming;
        else products.push(incoming);
      } else if (payload.eventType === "DELETE") {
        products = products.filter(p => p.id !== payload.old.id);
        if (activeId === payload.old.id) closeModal("viewModal");
      }
      saveLocalCache();
      render();
      if (activeId) {
        const active = products.find(p => p.id === activeId);
        if (active) updateViewReservation(active);
      }
      setStatus("синхронизировано", "ok");
    })
    .subscribe(status => {
      if (status === "SUBSCRIBED") setStatus("онлайн · общая база", "ok");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setStatus("нет realtime-связи", "warn");
    });
}

async function updateProduct(id, patch) {
  if (!supabase) {
    const index = products.findIndex(p => p.id === id);
    if (index < 0) throw new Error("Товар не найден");
    products[index] = { ...products[index], ...patch, updated_at: new Date().toISOString() };
    saveLocalCache();
    render();
    if (activeId === id) updateViewReservation(products[index]);
    return products[index];
  }
  const { data, error } = await supabase
    .from("wishlist_products")
    .update(patch)
    .eq("id", id)
    .select("id,url,title,description,image,manual_store,reserved,created_at,updated_at")
    .single();
  if (error) throw error;
  const updated = normalizeRow(data);
  const index = products.findIndex(p => p.id === id);
  if (index >= 0) products[index] = updated;
  else products.push(updated);
  saveLocalCache();
  render();
  return updated;
}

async function insertProduct(product) {
  if (!supabase) {
    const created = {
      id: "local-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      ...product,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    products.push(created);
    saveLocalCache();
    render();
    return created;
  }
  const { data, error } = await supabase
    .from("wishlist_products")
    .insert(product)
    .select("id,url,title,description,image,manual_store,reserved,created_at,updated_at")
    .single();
  if (error) throw error;
  const created = normalizeRow(data);
  products.push(created);
  saveLocalCache();
  render();
  return created;
}

async function deleteProduct(id) {
  if (supabase) {
    const { error } = await supabase.from("wishlist_products").delete().eq("id", id);
    if (error) throw error;
  }
  products = products.filter(p => p.id !== id);
  saveLocalCache();
  render();
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
  const patch = {};
  if (data.title) patch.title = data.title;
  if (data.description) patch.description = data.description;
  if (data.image) patch.image = data.image;
  if (data.sourceUrl) patch.url = data.sourceUrl;
  if (!Object.keys(patch).length) return p;
  return updateProduct(p.id, patch);
}

async function refreshAll() {
  const btn = document.getElementById("refreshAll");
  btn.disabled = true;
  setStatus("обновляю данные…");
  let ok = 0, failed = 0;

  // Последовательно, чтобы не перегружать API маркетплейсов и Vercel.
  for (const p of [...products]) {
    if (!p.url || p.manual_store) continue;
    try {
      await refreshOne(p);
      ok++;
    } catch {
      failed++;
    }
  }

  btn.disabled = false;
  setStatus(failed ? `обновлено: ${ok}, не удалось: ${failed}` : `обновлено: ${ok}`, failed ? "warn" : "ok");
}

async function toggleReserved(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  try {
    await updateProduct(id, { reserved: !p.reserved });
  } catch (e) {
    setStatus("Не удалось изменить бронь", "warn");
  }
}

function setLoading(isLoading) {
  const btn = document.getElementById("saveProduct");
  btn.disabled = isLoading;
  btn.textContent = isLoading ? "Получаю данные товара…" : "Добавить в вишлист";
}

function showAddMode(mode) {
  const auto = mode === "auto";
  document.getElementById("autoForm").classList.toggle("hidden", !auto);
  document.getElementById("manualForm").classList.toggle("hidden", auto);
  document.getElementById("autoTab").classList.toggle("active", auto);
  document.getElementById("manualTab").classList.toggle("active", !auto);
}

async function start() {
  try {
    const shared = await initSupabase();
    setStatus(shared ? "подключаюсь к общей базе…" : "локальный режим · Supabase ещё не настроен", shared ? "" : "warn");
    await loadProducts();

    // Одноразово переносим товары из старой localStorage-версии,
    // если они были у владельца до перехода на общую базу.
    await migrateLocalProducts();
    await loadProducts();
    render();
    subscribeRealtime();

    // После загрузки пробуем обновить метаданные карточек.
    setTimeout(() => refreshAll().catch(() => {}), 400);
  } catch (e) {
    console.error(e);
    setStatus("ошибка подключения", "warn");
    document.getElementById("grid").innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <h2>Не удалось подключить общую базу</h2>
        <p>${esc(e.message || "Проверь настройки Supabase.")}</p>
      </div>`;
  }
}

document.getElementById("openAdd").onclick = () => {
  openModal("addModal");
  showAddMode("auto");
};
document.getElementById("refreshAll").onclick = refreshAll;
document.getElementById("autoTab").onclick = () => showAddMode("auto");
document.getElementById("manualTab").onclick = () => showAddMode("manual");
document.getElementById("search").oninput = render;

document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => closeModal(b.dataset.close));
document.querySelectorAll(".modal").forEach(m => m.onclick = e => { if (e.target === m) closeModal(m.id); });

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
    let data = {};
    try { data = await fetchProduct(url); }
    catch (apiError) {
      throw apiError;
    }

    await insertProduct({
      url,
      title: data.title || "Новый подарок",
      image: data.image || "",
      description: data.description || "",
      manual_store: "",
      reserved: false
    });

    closeModal("addModal");
    document.getElementById("urlInput").value = "";
  } catch (e) {
    error.textContent = e.message || "Не удалось получить данные товара.";
  } finally {
    setLoading(false);
  }
};

document.getElementById("addManual").onclick = async () => {
  const url = document.getElementById("manualUrlInput").value.trim();
  const store = document.getElementById("manualStore").value;
  const title = document.getElementById("manualTitle").value.trim();
  const image = document.getElementById("manualImage").value.trim();
  const description = document.getElementById("manualDesc").value.trim();
  const error = document.getElementById("manualError");
  error.textContent = "";

  if (!title) { error.textContent = "Укажи название товара."; return; }
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch { error.textContent = "Укажи корректную ссылку на товар."; return; }

  if (image) {
    try {
      const parsedImage = new URL(image);
      if (!["http:", "https:"].includes(parsedImage.protocol)) throw new Error();
    } catch { error.textContent = "Ссылка на фото должна начинаться с http:// или https://."; return; }
  }

  try {
    await insertProduct({
      url, title, image, description,
      manual_store: store,
      reserved: false
    });
    closeModal("addModal");
    ["manualUrlInput", "manualTitle", "manualImage", "manualDesc"].forEach(id => document.getElementById(id).value = "");
  } catch (e) {
    error.textContent = e.message || "Не удалось добавить товар.";
  }
};

document.getElementById("toggleReserved").onclick = () => {
  if (activeId) toggleReserved(activeId);
};

document.getElementById("deleteProduct").onclick = async () => {
  if (!activeId) return;
  try {
    await deleteProduct(activeId);
    closeModal("viewModal");
  } catch (e) {
    setStatus("Не удалось удалить товар", "warn");
  }
};

render();
start();
