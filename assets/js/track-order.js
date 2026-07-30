(() => {
  const form = document.querySelector("[data-track-form]");
  const errorOutput = document.querySelector("[data-track-error]");
  const saved = JSON.parse(localStorage.getItem("curaLastOrder") || "null");
  const params = new URLSearchParams(location.search);

  function show(order) {
    document.querySelector("[data-track-number]").textContent = order.number;
    document.querySelector("[data-track-date]").textContent = order.date || new Date(order.created_at).toLocaleDateString("en-EG");
    document.querySelector("[data-track-total]").textContent = `EGP ${Number(order.total).toLocaleString("en-EG")}`;
    const stages = ["confirmed", "preparing", "out_for_delivery", "delivered"];
    const current = stages.indexOf(order.status || "confirmed");
    document.querySelectorAll(".timeline li").forEach((item, index) => item.classList.toggle("done", index <= current));
    document.querySelector(".status-head b").textContent = (order.status || "confirmed").replaceAll("_", " ");
    document.querySelector("[data-tracking-result]").hidden = false;
    errorOutput.textContent = "";
  }

  async function track() {
    const orderNumber = form.elements.order.value.trim().toUpperCase();
    const phone = form.elements.phone.value.replace(/\D/g, "");
    if (!orderNumber || !/^01[0125]\d{8}$/.test(phone)) {
      errorOutput.textContent = "Enter your order number and a valid 11-digit Egyptian mobile number.";
      document.querySelector("[data-tracking-result]").hidden = true;
      return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Checking...";
    try {
      const token = params.get("order") === orderNumber ? params.get("token") : "";
      const response = await fetch(`/api/orders?order=${encodeURIComponent(orderNumber)}&phone=${encodeURIComponent(phone)}${token ? `&token=${encodeURIComponent(token)}` : ""}`);
      const result = await response.json();
      if (!response.ok || !result.order) throw new Error("Order not found");
      show(result.order);
    } catch {
      document.querySelector("[data-tracking-result]").hidden = true;
      errorOutput.textContent = "We couldn't find an order with these details. Check the order number and phone.";
    } finally {
      button.disabled = false;
      button.textContent = "Track order";
    }
  }

  form.elements.phone.addEventListener("input", event => {
    event.target.value = event.target.value.replace(/\D/g, "").slice(0, 11);
    errorOutput.textContent = "";
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    track();
  });

  const urlOrder = params.get("order");
  if (urlOrder) form.elements.order.value = urlOrder;
  if (saved && (!urlOrder || urlOrder === saved.number)) {
    form.elements.order.value = saved.number;
    form.elements.phone.value = saved.phone;
    show(saved);
    track();
  }
})();
