const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");

const config = require("./config.json");
const BOOKS_FILE = path.join(__dirname, "data", "books.json");
const ORDERS_FILE = path.join(__dirname, "data", "orders.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---------- Rasm yuklash (multer) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `book-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Faqat rasm fayllari ruxsat etiladi"));
  },
});

// ---------- Yordamchi funksiyalar ----------
function readBooks() {
  try {
    return JSON.parse(fs.readFileSync(BOOKS_FILE, "utf8"));
  } catch {
    return [];
  }
}
function writeBooks(books) {
  fs.writeFileSync(BOOKS_FILE, JSON.stringify(books, null, 2), "utf8");
}
function nextId(books) {
  return books.reduce((max, b) => Math.max(max, b.id), 0) + 1;
}
function fmt(n) {
  return Number(n).toLocaleString("uz-UZ") + " so'm";
}
function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
  } catch {
    return [];
  }
}
function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

// Admin parolini tekshirish
function requireAdmin(req, res, next) {
  const pass = req.headers["x-admin-password"];
  if (pass !== config.adminPassword) {
    return res.status(401).json({ error: "Parol noto'g'ri" });
  }
  next();
}

// ---------- Telegram xabarnoma ----------
async function sendTelegram(text) {
  const token = config.telegramBotToken;
  const chatId = config.telegramChatId;
  if (!token || token.startsWith("BU_YERGA") || !chatId || chatId.startsWith("BU_YERGA")) {
    console.warn("⚠️  Telegram sozlanmagan — config.json ni to'ldiring.");
    return { ok: false, reason: "not_configured" };
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await resp.json();
  if (!data.ok) console.error("Telegram xato:", data);
  return data;
}

// ---------- API: Kitoblar ----------
app.get("/api/books", (req, res) => {
  res.json(readBooks());
});

// ---------- API: Admin (kitob qo'shish/o'chirish) ----------
app.post("/api/admin/login", (req, res) => {
  if (req.body.password === config.adminPassword) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.post("/api/admin/books", requireAdmin, upload.single("image"), (req, res) => {
  const { title, author, price, cat, emoji, color } = req.body;
  if (!title || !price || !cat) {
    return res.status(400).json({ error: "Nom, narx va kategoriya majburiy" });
  }
  const books = readBooks();
  const book = {
    id: nextId(books),
    title: String(title).trim(),
    author: (author || "").trim(),
    price: Number(price),
    cat,
    emoji: emoji || "📚",
    color: color || "#b8521b",
    image: req.file ? `/uploads/${req.file.filename}` : "",
  };
  books.push(book);
  writeBooks(books);
  res.json(book);
});

app.delete("/api/admin/books/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  let books = readBooks();
  const target = books.find((b) => b.id === id);
  if (!target) return res.status(404).json({ error: "Topilmadi" });
  // Rasm faylini ham o'chiramiz
  if (target.image) {
    const imgPath = path.join(__dirname, "public", target.image);
    fs.unlink(imgPath, () => {});
  }
  books = books.filter((b) => b.id !== id);
  writeBooks(books);
  res.json({ ok: true });
});

// ---------- API: Buyurtma ----------
app.post("/api/order", async (req, res) => {
  const { name, phone, address, items, clientId } = req.body;
  if (!name || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Ism, telefon va kitoblar majburiy" });
  }
  if (!clientId) return res.status(400).json({ error: "clientId topilmadi" });

  const books = readBooks();
  let total = 0;
  const orderItems = items
    .map((it) => {
      const b = books.find((x) => x.id === Number(it.id));
      if (!b) return null;
      total += b.price;
      return { id: b.id, title: b.title, price: b.price, emoji: b.emoji, image: b.image || "" };
    })
    .filter(Boolean);

  if (orderItems.length === 0) return res.status(400).json({ error: "Kitoblar topilmadi" });

  // Buyurtmani saqlaymiz
  const orders = readOrders();
  const order = {
    id: orders.reduce((m, o) => Math.max(m, o.id), 1000) + 1,
    clientId,
    name: String(name).trim(),
    phone: String(phone).trim(),
    address: (address || "").trim(),
    items: orderItems,
    total,
    status: "Yangi",
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  writeOrders(orders);

  const lines = orderItems.map((b) => `• ${b.emoji} ${b.title} — ${fmt(b.price)}`);
  const text =
    `🛒 <b>YANGI BUYURTMA!</b>  №${order.id}\n\n` +
    `👤 <b>Mijoz:</b> ${order.name}\n` +
    `📞 <b>Telefon:</b> ${order.phone}\n` +
    `📍 <b>Manzil:</b> ${order.address || "—"}\n\n` +
    `📚 <b>Kitoblar:</b>\n${lines.join("\n")}\n\n` +
    `💰 <b>Jami: ${fmt(total)}</b>`;

  const tg = await sendTelegram(text);
  res.json({ ok: true, order, telegram: tg.ok === true });
});

// Mijozning o'z buyurtmalari (clientId bo'yicha)
app.get("/api/orders", (req, res) => {
  const clientId = req.query.clientId;
  if (!clientId) return res.json([]);
  const orders = readOrders()
    .filter((o) => o.clientId === clientId)
    .sort((a, b) => b.id - a.id);
  res.json(orders);
});

// Buyurtmani tahrirlash (faqat aloqa ma'lumotlari, "Yangi" holatda)
app.patch("/api/orders/:id", async (req, res) => {
  const { clientId, name, phone, address } = req.body;
  const orders = readOrders();
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Buyurtma topilmadi" });
  if (order.clientId !== clientId) return res.status(403).json({ error: "Ruxsat yo'q" });
  if (order.status !== "Yangi") {
    return res.status(400).json({ error: "Bu buyurtmani endi tahrirlab bo'lmaydi" });
  }
  if (name) order.name = String(name).trim();
  if (phone) order.phone = String(phone).trim();
  if (address !== undefined) order.address = String(address).trim();
  writeOrders(orders);

  await sendTelegram(
    `✏️ <b>Buyurtma o'zgartirildi</b>  №${order.id}\n\n` +
      `👤 ${order.name}\n📞 ${order.phone}\n📍 ${order.address || "—"}`
  );
  res.json({ ok: true, order });
});

// Buyurtmani bekor qilish
app.post("/api/orders/:id/cancel", async (req, res) => {
  const { clientId } = req.body;
  const orders = readOrders();
  const order = orders.find((o) => o.id === Number(req.params.id));
  if (!order) return res.status(404).json({ error: "Buyurtma topilmadi" });
  if (order.clientId !== clientId) return res.status(403).json({ error: "Ruxsat yo'q" });
  if (order.status === "Bekor qilingan") {
    return res.status(400).json({ error: "Allaqachon bekor qilingan" });
  }
  order.status = "Bekor qilingan";
  writeOrders(orders);

  await sendTelegram(
    `❌ <b>BUYURTMA BEKOR QILINDI</b>  №${order.id}\n\n` +
      `👤 ${order.name}\n📞 ${order.phone}\n💰 ${fmt(order.total)}`
  );
  res.json({ ok: true, order });
});

// ---------- Admin sahifasi ----------
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Multer va boshqa xatolarni ushlash
app.use((err, req, res, next) => {
  console.error("Xato:", err.message);
  res.status(400).json({ error: err.message || "Xatolik yuz berdi" });
});

function getLanIps() {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name in nets) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const PORT = config.port || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n✅ Kitobxon ishga tushdi!`);
  console.log(`   Shu kompyuterda:  http://localhost:${PORT}`);
  console.log(`   Admin panel:      http://localhost:${PORT}/admin`);
  const ips = getLanIps();
  if (ips.length) {
    console.log(`\n📱 Telefon (xuddi shu Wi-Fi'da) uchun:`);
    ips.forEach((ip) => console.log(`   http://${ip}:${PORT}`));
  }
  console.log("");
});
