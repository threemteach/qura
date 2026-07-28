(() => {
  const form = document.querySelector("[data-track-form]");
  const saved = JSON.parse(localStorage.getItem("curaLastOrder") || "null");
  const params = new URLSearchParams(location.search);
  if (saved && params.get("order") === saved.number) { form.elements.order.value = saved.number; form.elements.phone.value = saved.phone; show(saved); }
  function show(order) {
    document.querySelector("[data-track-number]").textContent = order.number;
    document.querySelector("[data-track-date]").textContent = order.date;
    document.querySelector("[data-track-total]").textContent = `EGP ${order.total.toLocaleString("en-EG")}`;
    document.querySelector("[data-tracking-result]").hidden = false;
    document.querySelector("[data-track-error]").textContent = "";
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (saved && form.elements.order.value.trim().toUpperCase() === saved.number && form.elements.phone.value.replace(/\s/g, "") === saved.phone) show(saved);
    else { document.querySelector("[data-tracking-result]").hidden = true; document.querySelector("[data-track-error]").textContent = "We couldn’t find an order with these details."; }
  });
})();
