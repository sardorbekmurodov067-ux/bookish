// ====== HOLAT ======
let BOOKS = [];
let activeCat = "all";
let searchQuery = "";
let cart = [];

// Har bir brauzer uchun maxfiy ID (buyurtmalar shu IDga bog'lanadi)
function getClientId() {
  let id = localStorage.getItem("kx_client_id");
  if (!id) {
    id = "c-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("kx_client_id", id);
  }
  return id;
}
const CLIENT_ID = getClientId();

const CAT_NAMES = {
  all: "Barcha kitoblar",
  comics: "Comics",
  badiiy: "Badiiy adabiyot",
  trend: "Trend kitoblar",
  bolalar: "Bolalar uchun",
};

// ====== DOM ======
const grid = document.getElementById("bookGrid");
const emptyState = document.getElementById("emptyState");
const catalogTitle = document.getElementById("catalogTitle");
const searchInput = document.getElementById("searchInput");
const searchForm = document.getElementById("searchForm");

const fmt = (n) => Number(n).toLocaleString("uz-UZ") + " so'm";

// ====== KITOBLARNI YUKLASH ======
async function loadBooks() {
  try {
    const resp = await fetch("/api/books");
    BOOKS = await resp.json();
  } catch {
    BOOKS = [];
  }
  renderBooks();
}

// ====== KITOBLARNI CHIZISH ======
function renderBooks() {
  const q = searchQuery.trim().toLowerCase();
  const list = BOOKS.filter((b) => {
    const okCat = activeCat === "all" || b.cat === activeCat;
    const okSearch =
      !q ||
      b.title.toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q);
    return okCat && okSearch;
  });

  catalogTitle.textContent = q
    ? `"${searchQuery}" bo'yicha natijalar`
    : CAT_NAMES[activeCat];

  grid.innerHTML = list
    .map(
      (b) => `
    <article class="card">
      <div class="card__cover" style="background:${b.color}22">
        <span class="card__badge">${CAT_NAMES[b.cat] || b.cat}</span>
        ${b.image ? `<img class="card__img" src="${b.image}" alt="${b.title}" loading="lazy" />` : `<span>${b.emoji}</span>`}
      </div>
      <div class="card__body">
        <div class="card__title">${b.title}</div>
        <div class="card__author">${b.author || ""}</div>
        <div class="card__bottom">
          <span class="card__price">${fmt(b.price)}</span>
          <button class="card__add" data-add="${b.id}">+ Savat</button>
        </div>
      </div>
    </article>`
    )
    .join("");

  emptyState.hidden = list.length !== 0;
}

// ====== KATEGORIYALAR ======
document.getElementById("categories").addEventListener("click", (e) => {
  const chip = e.target.closest(".cat-chip");
  if (!chip) return;
  document.querySelectorAll(".cat-chip").forEach((c) => c.classList.remove("is-active"));
  chip.classList.add("is-active");
  activeCat = chip.dataset.cat;
  renderBooks();
});

// ====== QIDIRISH ======
searchForm.addEventListener("submit", (e) => {
  e.preventDefault();
  searchQuery = searchInput.value;
  renderBooks();
  document.getElementById("catalog").scrollIntoView({ behavior: "smooth" });
});
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value;
  renderBooks();
});

// ====== SAVAT ======
const cartCount = document.getElementById("cartCount");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartDrawer = document.getElementById("cartDrawer");

grid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (!btn) return;
  const book = BOOKS.find((b) => b.id === +btn.dataset.add);
  cart.push(book);
  updateCart();
  btn.textContent = "✓ Qo'shildi";
  setTimeout(() => (btn.textContent = "+ Savat"), 1000);
});

function updateCart() {
  cartCount.textContent = cart.length;
  if (cart.length === 0) {
    cartItems.innerHTML = `<p class="cart-empty">Savatcha bo'sh 🛒</p>`;
  } else {
    cartItems.innerHTML = cart
      .map(
        (b, i) => `
      <div class="cart-item">
        <span class="cart-item__emoji">${b.image ? `<img src="${b.image}" alt="" />` : b.emoji}</span>
        <div class="cart-item__info">
          <div class="cart-item__title">${b.title}</div>
          <div class="cart-item__price">${fmt(b.price)}</div>
        </div>
        <button class="cart-item__remove" data-remove="${i}">🗑️</button>
      </div>`
      )
      .join("");
  }
  const total = cart.reduce((s, b) => s + b.price, 0);
  cartTotal.textContent = fmt(total);
}

cartItems.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  cart.splice(+btn.dataset.remove, 1);
  updateCart();
});

document.getElementById("cartBtn").addEventListener("click", () => (cartDrawer.hidden = false));
document.getElementById("drawerClose").addEventListener("click", () => (cartDrawer.hidden = true));
document.getElementById("drawerOverlay").addEventListener("click", () => (cartDrawer.hidden = true));

// ====== BUYURTMA BERISH ======
const checkout = document.getElementById("checkout");
const orderForm = document.getElementById("orderForm");
const orderMsg = document.getElementById("orderMsg");

document.getElementById("checkoutBtn").addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Savatcha bo'sh!");
    return;
  }
  cartDrawer.hidden = true;
  checkout.hidden = false;
});
document.getElementById("checkoutClose").addEventListener("click", () => (checkout.hidden = true));
document.getElementById("checkoutOverlay").addEventListener("click", () => (checkout.hidden = true));

orderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = orderForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Yuborilmoqda...";
  orderMsg.textContent = "";

  const payload = {
    name: orderForm.name.value.trim(),
    phone: orderForm.phone.value.trim(),
    address: orderForm.address.value.trim(),
    items: cart.map((b) => ({ id: b.id })),
    clientId: CLIENT_ID,
  };

  try {
    const resp = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    if (resp.ok) {
      orderMsg.className = "order-msg order-msg--ok";
      orderMsg.textContent = "✅ Buyurtmangiz qabul qilindi! Tez orada bog'lanamiz.";
      cart = [];
      updateCart();
      orderForm.reset();
      setTimeout(() => (checkout.hidden = true), 2500);
    } else {
      orderMsg.className = "order-msg order-msg--err";
      orderMsg.textContent = "❌ " + (data.error || "Xatolik yuz berdi");
    }
  } catch {
    orderMsg.className = "order-msg order-msg--err";
    orderMsg.textContent = "❌ Server bilan bog'lanib bo'lmadi";
  } finally {
    btn.disabled = false;
    btn.textContent = "Buyurtmani tasdiqlash";
  }
});

// ====== MENING BUYURTMALARIM ======
const ordersDrawer = document.getElementById("ordersDrawer");
const ordersList = document.getElementById("ordersList");

const STATUS_CLASS = {
  "Yangi": "ord-badge--new",
  "Bekor qilingan": "ord-badge--cancel",
};

function dateStr(iso) {
  const d = new Date(iso);
  return d.toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function loadOrders() {
  ordersList.innerHTML = `<p class="cart-empty">Yuklanmoqda...</p>`;
  let orders = [];
  try {
    const resp = await fetch("/api/orders?clientId=" + encodeURIComponent(CLIENT_ID));
    orders = await resp.json();
  } catch {}
  if (!orders.length) {
    ordersList.innerHTML = `<p class="cart-empty">Sizda hali buyurtma yo'q 📭</p>`;
    return;
  }
  ordersList.innerHTML = orders
    .map((o) => {
      const items = o.items
        .map((b) => `<div class="ord-item">${b.emoji} ${b.title} <span>${fmt(b.price)}</span></div>`)
        .join("");
      const canEdit = o.status === "Yangi";
      return `
      <div class="ord-card">
        <div class="ord-card__top">
          <span class="ord-no">Buyurtma №${o.id}</span>
          <span class="ord-badge ${STATUS_CLASS[o.status] || ""}">${o.status}</span>
        </div>
        <div class="ord-date">${dateStr(o.createdAt)}</div>
        <div class="ord-items">${items}</div>
        <div class="ord-meta">👤 ${o.name} · 📞 ${o.phone}${o.address ? " · 📍 " + o.address : ""}</div>
        <div class="ord-total">Jami: <strong>${fmt(o.total)}</strong></div>
        ${
          canEdit
            ? `<div class="ord-actions">
                 <button class="ord-btn ord-btn--edit" data-edit='${JSON.stringify({ id: o.id, name: o.name, phone: o.phone, address: o.address })}'>✏️ Tahrirlash</button>
                 <button class="ord-btn ord-btn--cancel" data-cancel="${o.id}">❌ Bekor qilish</button>
               </div>`
            : ""
        }
      </div>`;
    })
    .join("");
}

document.getElementById("ordersBtn").addEventListener("click", () => {
  ordersDrawer.hidden = false;
  loadOrders();
});
document.getElementById("ordersClose").addEventListener("click", () => (ordersDrawer.hidden = true));
document.getElementById("ordersOverlay").addEventListener("click", () => (ordersDrawer.hidden = true));

// Bekor qilish va tahrirlash tugmalari
ordersList.addEventListener("click", async (e) => {
  const cancelBtn = e.target.closest("[data-cancel]");
  const editBtn = e.target.closest("[data-edit]");

  if (cancelBtn) {
    if (!confirm("Buyurtmani bekor qilmoqchimisiz?")) return;
    await fetch(`/api/orders/${cancelBtn.dataset.cancel}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID }),
    });
    loadOrders();
  }

  if (editBtn) {
    const o = JSON.parse(editBtn.dataset.edit);
    editForm.id.value = o.id;
    editForm.name.value = o.name;
    editForm.phone.value = o.phone;
    editForm.address.value = o.address || "";
    editMsg.textContent = "";
    editModal.hidden = false;
  }
});

// Tahrir modal
const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editMsg = document.getElementById("editMsg");
document.getElementById("editClose").addEventListener("click", () => (editModal.hidden = true));
document.getElementById("editOverlay").addEventListener("click", () => (editModal.hidden = true));

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const resp = await fetch("/api/orders/" + editForm.id.value, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      name: editForm.name.value.trim(),
      phone: editForm.phone.value.trim(),
      address: editForm.address.value.trim(),
    }),
  });
  const data = await resp.json();
  if (resp.ok) {
    editModal.hidden = true;
    loadOrders();
  } else {
    editMsg.className = "order-msg order-msg--err";
    editMsg.textContent = "❌ " + (data.error || "Xatolik");
  }
});

// ====== BOSHLASH ======
loadBooks();
updateCart();
