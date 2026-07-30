(() => {
  const form = document.querySelector("[data-track-form]");
  const saved = JSON.parse(localStorage.getItem("curaLastOrder") || "null");
  const params = new URLSearchParams(location.search);
  if (saved && params.get("order") === saved.number) { form.elements.order.value = saved.number; form.elements.phone.value = saved.phone; show(saved); }
  function show(order) {
    document.querySelector("[data-track-number]").textContent = order.number;
    document.querySelector("[data-track-date]").textContent = order.date;
    document.querySelector("[data-track-total]").textContent = `EGP ${order.total.toLocaleString("en-EG")}`;
    const stages = ["confirmed","preparing","out_for_delivery","delivered"];
    const current = stages.indexOf(order.status || "confirmed");
    document.querySelectorAll(".timeline li").forEach((item, index) => item.classList.toggle("done", index <= current));
    document.querySelector(".status-head b").textContent = (order.status || "confirmed").replaceAll("_", " ");
    document.querySelector("[data-tracking-result]").hidden = false;
    document.querySelector("[data-track-error]").textContent = "";
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (saved && form.elements.order.value.trim().toUpperCase() === saved.number && form.elements.phone.value.replace(/\s/g, "") === saved.phone) show(saved);
    else {
      const response = await fetch(`/api/orders?order=${encodeURIComponent(form.elements.order.value.trim().toUpperCase())}&phone=${encodeURIComponent(form.elements.phone.value.replace(/\s/g,""))}`);
      const result = await response.json();
      if (response.ok) show({ ...result.order, date: new Date(result.order.created_at).toLocaleDateString("en-EG") });
      else { document.querySelector("[data-tracking-result]").hidden = true; document.querySelector("[data-track-error]").textContent = "We couldn’t find an order with these details."; }
    }
  });
})();
