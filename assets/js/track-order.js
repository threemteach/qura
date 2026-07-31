(() => {
  const form = document.querySelector("[data-track-form]");
  const input = form.elements.query;
  const errorOutput = document.querySelector("[data-track-error]");
  const results = document.querySelector("[data-tracking-results]");
  const saved = JSON.parse(localStorage.getItem("curaLastOrder") || "null");
  const params = new URLSearchParams(location.search);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  function render(orders) {
    const stages = ["checking", "preparing", "out_for_delivery", "delivered"];
    results.innerHTML = orders.map(order => {
      const status = order.status === "confirmed" ? "checking" : (order.status || "checking");
      const current = Math.max(0, stages.indexOf(status));
      const statusNote = status === "on_hold" ? '<p class="tracking-notice">This order is temporarily on hold. The store will contact you if more information is needed.</p>' : status === "cancelled" ? '<p class="tracking-notice cancelled">This order has been cancelled.</p>' : "";
      return `<section class="tracking-result">
        <div class="order-meta"><div><small>ORDER NUMBER</small><b>${escapeHtml(order.number)}</b></div><div><small>PLACED ON</small><b>${new Date(order.created_at).toLocaleDateString("en-EG")}</b></div><div><small>TOTAL</small><b>EGP ${Number(order.total).toLocaleString("en-EG")}</b></div></div>
        <div class="status-head"><span>Current status</span><b>${escapeHtml(status.replaceAll("_", " "))}</b></div>
        ${statusNote}
        <ol class="timeline">
          <li class="${current >= 0 ? "done" : ""}"><span>✓</span><div><b>Checking payment</b><small>We received your order and will review the payment receipt.</small></div></li>
          <li class="${current >= 1 ? "done" : ""}"><span>2</span><div><b>Preparing your order</b><small>Your order is being packed.</small></div></li>
          <li class="${current >= 2 ? "done" : ""}"><span>3</span><div><b>Out for delivery</b><small>The courier is on the way.</small></div></li>
          <li class="${current >= 3 ? "done" : ""}"><span>4</span><div><b>Delivered</b><small>Your order has arrived.</small></div></li>
        </ol>
      </section>`;
    }).join("");
    errorOutput.textContent = "";
  }

  async function track() {
    const query = input.value.trim();
    const isPhone = /^01[0125]\d{8}$/.test(query.replace(/\D/g, ""));
    const isOrder = /^CC-[A-Z0-9]{6,}$/i.test(query);
    if (!isPhone && !isOrder) {
      results.innerHTML = "";
      errorOutput.textContent = "Enter a valid 11-digit Egyptian mobile number or an order number such as CC-123456.";
      return;
    }
    const normalized = isPhone ? query.replace(/\D/g, "") : query.toUpperCase();
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Checking...";
    try {
      const token = params.get("order")?.toUpperCase() === normalized ? params.get("token") : "";
      const response = await fetch(`/api/orders?query=${encodeURIComponent(normalized)}${token ? `&token=${encodeURIComponent(token)}` : ""}`);
      const result = await response.json();
      if (!response.ok || !result.orders?.length) throw new Error("Order not found");
      render(result.orders);
    } catch {
      results.innerHTML = "";
      errorOutput.textContent = "We couldn't find any orders with this mobile or order number.";
    } finally {
      button.disabled = false;
      button.textContent = "Track order";
    }
  }

  input.addEventListener("input", () => { errorOutput.textContent = ""; });
  form.addEventListener("submit", event => { event.preventDefault(); track(); });

  const urlOrder = params.get("order");
  if (urlOrder) {
    input.value = urlOrder;
    track();
  } else if (saved?.phone) {
    input.value = saved.phone;
    track();
  }
})();
