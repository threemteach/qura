(() => {
  const data = window.CURA_DATA;
  const cart = JSON.parse(localStorage.getItem("curaCart") || "[]");
  const money = value => `EGP ${value.toLocaleString("en-EG")}`;
  const products = cart.map(item => ({ ...data.products.find(product => product.id === item.id), qty: item.qty })).filter(item => item.id);
  const subtotal = products.reduce((sum, item) => sum + item.price * item.qty, 0);
  const delivery = products.length ? 65 : 0;
  const items = document.querySelector("[data-checkout-items]");
  items.innerHTML = products.map(item => `<div class="checkout-item"><img src="${item.image}" alt=""><div><b>${item.name}</b><small>${item.brand} · Qty ${item.qty}</small></div><strong>${money(item.price * item.qty)}</strong></div>`).join("");
  document.querySelector("[data-summary-subtotal]").textContent = money(subtotal);
  document.querySelector("[data-summary-total]").textContent = money(subtotal + delivery);
  document.querySelector("[data-summary-empty]").hidden = products.length > 0;
  let proofData = "";
  const paymentProof = document.querySelector("[data-payment-proof]");
  const codNote = document.querySelector("[data-cod-note]");
  document.querySelectorAll("[name=payment]").forEach(input => input.addEventListener("change", () => {
    const cash = input.value === "cod";
    paymentProof.hidden = cash;
    codNote.hidden = !cash;
    document.querySelector("[data-payment-error]").textContent = "";
  }));
  const upload = document.querySelector("#proof-upload");
  upload.addEventListener("change", () => {
    const file = upload.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { document.querySelector("[data-proof-error]").textContent = "Image must be smaller than 5 MB."; upload.value = ""; return; }
    const reader = new FileReader();
    reader.onload = event => {
      proofData = event.target.result;
      document.querySelector("[data-proof-preview] img").src = proofData;
      document.querySelector("[data-proof-preview]").hidden = false;
      document.querySelector(".upload-box").hidden = true;
      document.querySelector("[data-proof-error]").textContent = "";
    };
    reader.readAsDataURL(file);
  });
  document.querySelector("[data-remove-proof]").addEventListener("click", () => {
    proofData = ""; upload.value = ""; document.querySelector("[data-proof-preview]").hidden = true; document.querySelector(".upload-box").hidden = false;
  });
  const form = document.querySelector("[data-checkout-form]");
  form.addEventListener("submit", event => {
    event.preventDefault();
    let valid = true;
    form.querySelectorAll("[required]:not([type=radio])").forEach(field => {
      const error = field.parentElement.querySelector("small");
      let message = field.value.trim() ? "" : "This field is required.";
      if (field.name === "phone" && field.value && !/^01[0125]\d{8}$/.test(field.value.replace(/\s/g, ""))) message = "Enter a valid Egyptian phone number.";
      if (field.name === "email" && field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) message = "Enter a valid email address.";
      if (error) error.textContent = message;
      if (message) valid = false;
    });
    const payment = form.querySelector("[name=payment]:checked");
    if (!payment) { document.querySelector("[data-payment-error]").textContent = "Choose a payment method."; valid = false; }
    else if (payment.value !== "cod" && !proofData) { document.querySelector("[data-proof-error]").textContent = "Upload your payment screenshot."; valid = false; }
    if (!products.length) valid = false;
    if (!valid) return;
    const order = { number: `CC-${Math.floor(100000 + Math.random() * 900000)}`, phone: form.elements.phone.value.replace(/\s/g, ""), date: new Date().toLocaleDateString("en-EG"), total: subtotal + delivery, payment: payment.value, status: "confirmed" };
    localStorage.setItem("curaLastOrder", JSON.stringify(order));
    localStorage.removeItem("curaCart");
    location.href = `track-order.html?order=${encodeURIComponent(order.number)}`;
  });
})();
