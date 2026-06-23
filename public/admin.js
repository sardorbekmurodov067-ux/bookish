let adminPassword = "";

const CAT_NAMES = {
  comics: "Comics",
  badiiy: "Badiiy",
  trend: "Trend kitoblar",
  bolalar: "Bolalar uchun",
};
const fmt = (n) => Number(n).toLocaleString("uz-UZ") + " so'm";

const loginBox = document.getElementById("loginBox");
const panel = document.getElementById("panel");
const loginForm = document.getElementById("loginForm");
const loginMsg = document.getElementById("loginMsg");

// ====== KIRISH ======
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pass = document.getElementById("loginPass").value;
  const resp = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: pass }),
  });
  if (resp.ok) {
    adminPassword = pass;
    loginBox.hidden = true;
    panel.hidden = false;
    loadList();
  } else {
    loginMsg.textContent = "Parol noto'g'ri!";
  }
});

// ====== RO'YXATNI YUKLASH ======
async function loadList() {
  const resp = await fetch("/api/books");
  const books = await resp.json();
  document.getElementById("count").textContent = books.length;
  const list = document.getElementById("adminList");
  list.innerHTML = books
    .map(
      (b) => `
    <div class="admin-row">
      <div class="admin-row__emoji" style="background:${b.color}22">${
        b.image ? `<img src="${b.image}" alt="" />` : b.emoji
      }</div>
      <div class="admin-row__info">
        <div class="admin-row__title">${b.title}</div>
        <div class="admin-row__meta">${b.author || "—"} · ${CAT_NAMES[b.cat] || b.cat}</div>
      </div>
      <div class="admin-row__price">${fmt(b.price)}</div>
      <button class="admin-row__del" data-del="${b.id}">O'chirish</button>
    </div>`
    )
    .join("");
}

// ====== QO'SHISH ======
const addForm = document.getElementById("addForm");
const addMsg = document.getElementById("addMsg");
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = addForm.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Saqlanmoqda...";

  const fd = new FormData();
  fd.append("title", addForm.title.value);
  fd.append("author", addForm.author.value);
  fd.append("price", addForm.price.value);
  fd.append("cat", addForm.cat.value);
  fd.append("emoji", addForm.emoji.value || "📚");
  fd.append("color", addForm.color.value);
  if (addForm.image.files[0]) fd.append("image", addForm.image.files[0]);

  try {
    const resp = await fetch("/api/admin/books", {
      method: "POST",
      headers: { "x-admin-password": adminPassword },
      body: fd,
    });
    const data = await resp.json();
    if (resp.ok) {
      addMsg.className = "order-msg order-msg--ok";
      addMsg.textContent = "✅ Kitob qo'shildi!";
      addForm.reset();
      addForm.color.value = "#b8521b";
      loadList();
      setTimeout(() => (addMsg.textContent = ""), 2000);
    } else {
      addMsg.className = "order-msg order-msg--err";
      addMsg.textContent = "❌ " + (data.error || "Xatolik");
    }
  } catch {
    addMsg.className = "order-msg order-msg--err";
    addMsg.textContent = "❌ Server bilan bog'lanib bo'lmadi";
  } finally {
    btn.disabled = false;
    btn.textContent = "Qo'shish";
  }
});

// ====== O'CHIRISH ======
document.getElementById("adminList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  if (!confirm("Ushbu kitob o'chirilsinmi?")) return;
  const resp = await fetch("/api/admin/books/" + btn.dataset.del, {
    method: "DELETE",
    headers: { "x-admin-password": adminPassword },
  });
  if (resp.ok) loadList();
});
