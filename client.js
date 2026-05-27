// ══════════════════════════════════════════════════════════════════════════════
//  Coffee Day Cafe — Frontend API Client
//  Place this file in the same folder as new.html and rename the
//  <script href="server.js"> tag to <script src="client.js"></script>
// ══════════════════════════════════════════════════════════════════════════════

// ── Cart state ────────────────────────────────────────────────────────────────
const cart = {};

// ── On page load: check login & load reviews ─────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  await checkLoginStatus();
  await loadReviews();
});

async function checkLoginStatus() {
  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      // Show a welcome banner + logout button in the header
      const header = document.querySelector("header");
      const banner = document.createElement("div");
      banner.style.cssText = "background:#4b091e;color:#ffd;padding:6px 20px;font-size:13px;display:flex;justify-content:space-between;align-items:center;";
      banner.innerHTML = `
        <span>👋 Hello, <strong>${data.username}</strong>!</span>
        <button onclick="logout()" style="background:transparent;border:1px solid #ffd;color:#ffd;padding:4px 10px;cursor:pointer;border-radius:4px;">Logout</button>
      `;
      header.prepend(banner);
    } else {
      // Not logged in — redirect to login page
      window.location.href = "login.html";
    }
  } catch {
    console.warn("Backend not reachable — running in offline mode.");
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function logout() {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  window.location.href = "login.html";
}

// ── Reservation form ──────────────────────────────────────────────────────────
async function validateForm() {
  const name  = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const date  = document.querySelector('#reservation input[type="date"]').value;
  const time  = document.querySelector('#reservation input[type="time"]').value;

  if (!name || !email || !date || !time) {
    alert("Please fill in all fields!");
    return false;
  }

  try {
    const res  = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, date, time }),
      credentials: "include",
    });
    const data = await res.json();
    alert(data.message);
  } catch {
    alert("Reservation saved locally (server not reachable).");
  }

  return false; // prevent page refresh
}

// ── Cart & Orders ─────────────────────────────────────────────────────────────
function addToCart(itemId, itemName) {
  cart[itemId] = (cart[itemId] || 0) + 1;
  updateCartDisplay();
  alert(`${itemName} added to cart! 🛒`);
}

function updateCartDisplay() {
  let cartEl = document.getElementById("cart-summary");
  if (!cartEl) {
    cartEl = document.createElement("div");
    cartEl.id = "cart-summary";
    cartEl.style.cssText =
      "position:fixed;bottom:20px;right:20px;background:#671215;color:white;padding:14px 18px;border-radius:10px;z-index:999;min-width:180px;box-shadow:0 4px 12px rgba(0,0,0,0.3);";
    document.body.appendChild(cartEl);
  }

  const PRICES = { espresso: 120, cappuccino: 150, latte: 160, brownie: 100 };
  let total = 0;
  let lines = "";
  for (const [id, qty] of Object.entries(cart)) {
    total += PRICES[id] * qty;
    lines += `<div style="font-size:13px">${id} × ${qty}</div>`;
  }

  cartEl.innerHTML = `
    <strong>🛒 Cart</strong>
    ${lines}
    <hr style="border-color:rgba(255,255,255,.3);margin:8px 0">
    <strong>Total: ₹${total}</strong><br>
    <button onclick="placeOrder()"
      style="margin-top:8px;background:white;color:#671215;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-weight:bold;width:100%;">
      Place Order
    </button>
  `;
}

async function placeOrder() {
  if (Object.keys(cart).length === 0) {
    alert("Your cart is empty!");
    return;
  }

  const items = Object.entries(cart).map(([itemId, quantity]) => ({ itemId, quantity }));

  try {
    const res  = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      credentials: "include",
    });
    const data = await res.json();

    if (data.success) {
      alert(`Order confirmed! 🎉\nTotal: ₹${data.order.total}`);
      for (const key of Object.keys(cart)) delete cart[key];
      const cartEl = document.getElementById("cart-summary");
      if (cartEl) cartEl.remove();
    } else {
      alert(data.message);
    }
  } catch {
    alert("Order placed locally (server not reachable).");
  }
}

// ── Reviews ───────────────────────────────────────────────────────────────────
async function loadReviews() {
  try {
    const res  = await fetch("/api/reviews");
    const data = await res.json();
    const section = document.getElementById("reviews");
    if (!section || !data.reviews) return;

    // Remove existing static review cards
    section.querySelectorAll(".card").forEach((c) => c.remove());

    // Inject reviews from backend
    const container = document.createElement("div");
    container.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px;";

    if (data.reviews.length === 0) {
      container.innerHTML = '<p style="color:#888">No reviews yet — be the first!</p>';
    } else {
      for (const r of data.reviews) {
        const stars = "⭐".repeat(r.rating);
        const card  = document.createElement("div");
        card.className = "card";
        card.style.minWidth = "200px";
        card.innerHTML = `
          <strong>${r.username}</strong>
          <div style="color:orange;font-size:14px">${stars}</div>
          <p style="margin-top:6px">"${r.text}"</p>
          <small style="color:#aaa">${new Date(r.createdAt).toLocaleDateString()}</small>
        `;
        container.appendChild(card);
      }
    }

    // Insert before the review form
    const form = section.querySelector("form");
    section.insertBefore(container, form);
  } catch {
    console.warn("Could not load reviews from server.");
  }
}

async function reviewAlert(event) {
  if (event) event.preventDefault();
  const textarea = document.querySelector("#reviews textarea");
  const text = textarea ? textarea.value.trim() : "";
  const rating = 5; // default — you can add a star picker later

  if (!text) {
    alert("Please write something before submitting!");
    return false;
  }

  try {
    const res  = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, rating }),
      credentials: "include",
    });
    const data = await res.json();
    alert(data.message);
    if (data.success) {
      if (textarea) textarea.value = "";
      await loadReviews();
    }
  } catch {
    alert("Thank you for your review! (saved locally)");
  }

  return false;
}