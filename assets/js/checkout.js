(async () => {
  const cart = JSON.parse(localStorage.getItem("curaCart") || "[]");
  const money = value => `EGP ${Number(value).toLocaleString("en-EG")}`;
  let catalog = window.CURA_DATA.products;
  let settings = { delivery_fee: 65, instapay_name: "", instapay_address: "01XX XXX XXXX", vodafone_cash_number: "01XX XXX XXXX", payment_note: "" };
  try {
    const response = await fetch("/api/catalog");
    if (response.ok) {
      const payload = await response.json();
      settings = { ...settings, ...payload.settings };
      catalog = payload.products.map(product => ({ ...product, image: product.image_url, product_variants: product.product_variants || [] }));
    }
  } catch {}
  const products = cart.map(item => {
    const product = catalog.find(entry => String(entry.id) === String(item.id));
    return product ? { ...product, qty: item.qty, selectedPrice: Number(item.price || product.price || 0), variantId: item.variantId, variantLabel: item.variantLabel || "Standard" } : null;
  }).filter(Boolean);
  const subtotal = products.reduce((sum, item) => sum + item.selectedPrice * item.qty, 0);
  const delivery = products.length ? Number(settings.delivery_fee || 0) : 0;
  document.querySelector("[data-checkout-items]").innerHTML = products.map(item => `<div class="checkout-item"><img src="${item.image}" alt=""><div><b>${item.name}</b><small>${item.variantLabel} · Qty ${item.qty}</small></div><strong>${money(item.selectedPrice * item.qty)}</strong></div>`).join("");
  document.querySelector("[data-summary-subtotal]").textContent = money(subtotal);
  document.querySelector("[data-summary-total]").textContent = money(subtotal + delivery);
  document.querySelector("[data-summary-empty]").hidden = products.length > 0;
  let proofData = "";
  const paymentProof = document.querySelector("[data-payment-proof]");
  const codNote = document.querySelector("[data-cod-note]");
  document.querySelectorAll("[name=payment]").forEach(input => input.addEventListener("change", () => {
    const cash = input.value === "cod";
    paymentProof.hidden = cash; codNote.hidden = !cash;
    const account = input.value === "instapay" ? `${settings.instapay_name || "Cura Care"} · ${settings.instapay_address}` : settings.vodafone_cash_number;
    paymentProof.querySelector("span").textContent = `Payment account: ${account}`;
    document.querySelector("[data-payment-instruction]").textContent = settings.payment_note || "Transfer your total, then upload a screenshot.";
    document.querySelector("[data-payment-error]").textContent = "";
  }));
  const upload = document.querySelector("#proof-upload");
  upload.addEventListener("change", () => {
    const file = upload.files[0]; if (!file) return;
    if (file.size > 4 * 1024 * 1024) { document.querySelector("[data-proof-error]").textContent = "Image must be smaller than 4 MB."; upload.value = ""; return; }
    const reader = new FileReader();
    reader.onload = event => { proofData = event.target.result; document.querySelector("[data-proof-preview] img").src = proofData; document.querySelector("[data-proof-preview]").hidden = false; document.querySelector(".upload-box").hidden = true; document.querySelector("[data-proof-error]").textContent = ""; };
    reader.readAsDataURL(file);
  });
  document.querySelector("[data-remove-proof]").addEventListener("click", () => { proofData = ""; upload.value = ""; document.querySelector("[data-proof-preview]").hidden = true; document.querySelector(".upload-box").hidden = false; });
  const form = document.querySelector("[data-checkout-form]");
  form.addEventListener("submit", async event => {
    event.preventDefault(); let valid = true;
    form.querySelectorAll("[required]:not([type=radio])").forEach(field => {
      const error = field.parentElement.querySelector("small"); let message = field.value.trim() ? "" : "This field is required.";
      if (field.name === "phone" && field.value && !/^01[0125]\d{8}$/.test(field.value.replace(/\s/g, ""))) message = "Enter a valid Egyptian phone number.";
      if (field.name === "email" && field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) message = "Enter a valid email address.";
      if (error) error.textContent = message; if (message) valid = false;
    });
    const payment = form.querySelector("[name=payment]:checked");
    if (!payment) { document.querySelector("[data-payment-error]").textContent = "Choose a payment method."; valid = false; }
    else if (payment.value !== "cod" && !proofData) { document.querySelector("[data-proof-error]").textContent = "Upload your payment screenshot."; valid = false; }
    if (!products.length) valid = false;
    if (!valid) return;
    const button = form.querySelector(".place-order"); button.disabled = true; button.textContent = "Placing order…";
    try {
      let proofPath = null;
      if (payment.value !== "cod") {
        const proofResponse = await fetch("/api/payment-proof", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl: proofData }) });
        const proof = await proofResponse.json(); if (!proofResponse.ok) throw new Error(proof.error); proofPath = proof.path;
      }
      const payload = { customer: { name: form.elements.name.value, phone: form.elements.phone.value.replace(/\s/g, ""), email: form.elements.email.value, address: form.elements.address.value, city: form.elements.city.value, area: form.elements.area.value, notes: form.elements.notes.value }, items: cart.map(item => ({ variant_id: item.variantId, quantity: item.qty })), payment_method: payment.value, payment_proof_path: proofPath };
      const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      const order = { ...result.order, phone: payload.customer.phone, date: new Date(result.order.created_at).toLocaleDateString("en-EG") };
      localStorage.setItem("curaLastOrder", JSON.stringify(order)); localStorage.removeItem("curaCart");
      location.href = `track-order.html?order=${encodeURIComponent(order.number)}&token=${encodeURIComponent(order.tracking_token)}`;
    } catch (error) {
      document.querySelector("[data-payment-error]").textContent = error.message; button.disabled = false; button.textContent = "Place order";
    }
  });
})();
