const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(
  session({
    secret: "coffeday-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }, // 1 day
  })
);

// Serve your HTML files as static files
app.use(express.static(__dirname));

// ─── Simple JSON "Database" helpers ──────────────────────────────────────────
const DB_PATH = path.join(__dirname, "db.json");

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = { users: [], reservations: [], orders: [], reviews: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: "Please log in first." });
  }
  next();
}

// ════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/register  — Create a new account
app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
  }

  const db = readDB();
  const exists = db.users.find((u) => u.email === email);
  if (exists) {
    return res.status(409).json({ success: false, message: "Email already registered." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now().toString(),
    username,
    email,
    password: hashedPassword,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  writeDB(db);

  res.json({ success: true, message: "Registration successful! Please log in." });
});

// POST /api/login  — Log in
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required." });
  }

  const db = readDB();
  const user = db.users.find((u) => u.email === email);
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }

  req.session.userId = user.id;
  req.session.username = user.username;

  res.json({ success: true, message: `Welcome back, ${user.username}!`, username: user.username });
});

// POST /api/logout  — Log out
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true, message: "Logged out successfully." });
  });
});

// GET /api/me  — Get current logged-in user info
app.get("/api/me", requireLogin, (req, res) => {
  const db = readDB();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user) return res.status(404).json({ success: false, message: "User not found." });

  res.json({ success: true, username: user.username, email: user.email });
});

// ════════════════════════════════════════════════════════════════════════════
//  RESERVATION ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/reservations  — Book a table (login required)
app.post("/api/reservations", requireLogin, (req, res) => {
  const { name, email, date, time, guests } = req.body;

  if (!name || !email || !date || !time) {
    return res.status(400).json({ success: false, message: "Name, email, date, and time are required." });
  }

  const db = readDB();
  const reservation = {
    id: Date.now().toString(),
    userId: req.session.userId,
    name,
    email,
    date,
    time,
    guests: guests || 1,
    createdAt: new Date().toISOString(),
  };

  db.reservations.push(reservation);
  writeDB(db);

  res.json({ success: true, message: "Table reserved successfully!", reservation });
});

// GET /api/reservations  — Get reservations for logged-in user
app.get("/api/reservations", requireLogin, (req, res) => {
  const db = readDB();
  const myReservations = db.reservations.filter((r) => r.userId === req.session.userId);
  res.json({ success: true, reservations: myReservations });
});

// DELETE /api/reservations/:id  — Cancel a reservation
app.delete("/api/reservations/:id", requireLogin, (req, res) => {
  const db = readDB();
  const index = db.reservations.findIndex(
    (r) => r.id === req.params.id && r.userId === req.session.userId
  );

  if (index === -1) {
    return res.status(404).json({ success: false, message: "Reservation not found." });
  }

  db.reservations.splice(index, 1);
  writeDB(db);

  res.json({ success: true, message: "Reservation cancelled." });
});

// ════════════════════════════════════════════════════════════════════════════
//  ORDER ROUTES
// ════════════════════════════════════════════════════════════════════════════

const MENU = {
  espresso:   { name: "Espresso",   price: 120 },
  cappuccino: { name: "Cappuccino", price: 150 },
  latte:      { name: "Latte",      price: 160 },
  brownie:    { name: "Brownie",    price: 100 },
};

// POST /api/orders  — Place an order (login required)
app.post("/api/orders", requireLogin, (req, res) => {
  const { items } = req.body;
  // items = [{ itemId: "cappuccino", quantity: 2 }, ...]

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "No items in order." });
  }

  const orderItems = [];
  let total = 0;

  for (const { itemId, quantity } of items) {
    const menuItem = MENU[itemId];
    if (!menuItem) {
      return res.status(400).json({ success: false, message: `Unknown item: ${itemId}` });
    }
    const qty = parseInt(quantity) || 1;
    orderItems.push({ ...menuItem, quantity: qty, subtotal: menuItem.price * qty });
    total += menuItem.price * qty;
  }

  const db = readDB();
  const order = {
    id: Date.now().toString(),
    userId: req.session.userId,
    items: orderItems,
    total,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  db.orders.push(order);
  writeDB(db);

  res.json({ success: true, message: "Order placed successfully!", order });
});

// GET /api/orders  — Get orders for logged-in user
app.get("/api/orders", requireLogin, (req, res) => {
  const db = readDB();
  const myOrders = db.orders.filter((o) => o.userId === req.session.userId);
  res.json({ success: true, orders: myOrders });
});

// GET /api/menu  — Get full menu (public)
app.get("/api/menu", (req, res) => {
  res.json({ success: true, menu: MENU });
});

// ════════════════════════════════════════════════════════════════════════════
//  REVIEW ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /api/reviews  — Submit a review (login required)
app.post("/api/reviews", requireLogin, (req, res) => {
  const { text, rating } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ success: false, message: "Review text cannot be empty." });
  }
  if (rating && (rating < 1 || rating > 5)) {
    return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
  }

  const db = readDB();
  const review = {
    id: Date.now().toString(),
    userId: req.session.userId,
    username: req.session.username,
    text: text.trim(),
    rating: rating || 5,
    createdAt: new Date().toISOString(),
  };

  db.reviews.push(review);
  writeDB(db);

  res.json({ success: true, message: "Review submitted! Thank you.", review });
});

// GET /api/reviews  — Get all reviews (public)
app.get("/api/reviews", (req, res) => {
  const db = readDB();
  // Return reviews newest-first, hide userId
  const reviews = db.reviews
    .map(({ id, username, text, rating, createdAt }) => ({ id, username, text, rating, createdAt }))
    .reverse();
  res.json({ success: true, reviews });
});
// GET /api/users — Get all users (for testing only)
app.get("/api/users", (req, res) => {
  const db = readDB();
  const users = db.users.map(({ id, username, email, createdAt }) => ({ id, username, email, createdAt }));
  res.json({ success: true, users });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n☕  Coffee Day Cafe server running at http://localhost:${PORT}`);
  console.log(`   Login page → http://localhost:${PORT}/login.html`);
  console.log(`   Cafe page  → http://localhost:${PORT}/new.html\n`);
});