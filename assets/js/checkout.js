(async () => {
  const buyNowCart = JSON.parse(localStorage.getItem("curaBuyNow") || "[]");
  const cart = buyNowCart.length ? buyNowCart : JSON.parse(localStorage.getItem("curaCart") || "[]");
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
  const governorates = ["Cairo", "Giza", "Alexandria", "Dakahlia", "Red Sea", "Beheira", "Fayoum", "Gharbia", "Ismailia", "Monufia", "Minya", "Qalyubia", "New Valley", "Suez", "Aswan", "Assiut", "Beni Suef", "Port Said", "Damietta", "Sharqia", "South Sinai", "Kafr El Sheikh", "Matrouh", "Luxor", "Qena", "North Sinai", "Sohag"];
  const rates = Array.isArray(settings.delivery_rates) ? settings.delivery_rates : [];
  let delivery = products.length ? Number(settings.delivery_fee || 0) : 0;
  document.querySelector("[data-checkout-items]").innerHTML = products.map(item => `<div class="checkout-item"><img src="${item.image}" alt=""><div><b>${item.name}</b><small>${item.variantLabel} · Qty ${item.qty}</small></div><strong>${money(item.selectedPrice * item.qty)}</strong></div>`).join("");
  document.querySelector("[data-summary-subtotal]").textContent = money(subtotal);
  const deliveryOutput = document.querySelector("[data-summary-delivery]");
  const totalOutput = document.querySelector("[data-summary-total]");
  const governorateSelect = document.querySelector("[data-governorate]");
  governorateSelect.innerHTML = `<option value="">Choose governorate</option>${governorates.map(name => `<option>${name}</option>`).join("")}`;
  const updateDelivery = () => {
    const customRate = rates.find(rate => rate.governorate === governorateSelect.value);
    delivery = products.length ? Number(customRate?.fee ?? settings.delivery_fee ?? 0) : 0;
    deliveryOutput.textContent = money(delivery);
    totalOutput.textContent = money(subtotal + delivery);
  };
  governorateSelect.addEventListener("change", updateDelivery);
  updateDelivery();
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
  const validationSummary = document.querySelector("[data-checkout-errors]");
  const phoneInput = form.elements.phone;
  phoneInput.addEventListener("input", () => {
    phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 11);
  });
  form.addEventListener("input", event => {
    if (!event.target.matches("input, select, textarea")) return;
    event.target.removeAttribute("aria-invalid");
    const error = event.target.parentElement.querySelector("small");
    if (error) error.textContent = "";
  });
  form.addEventListener("submit", async event => {
    event.preventDefault(); let valid = true;
    let firstInvalid = null;
    const validationMessages = [];
    validationSummary.hidden = true;
    form.querySelectorAll("[required]:not([type=radio])").forEach(field => {
      const value = field.value.trim();
      const error = field.parentElement.querySelector("small");
      let message = value ? "" : "This field is required.";
      if (field.name === "name" && value && (value.length < 2 || /\d/.test(value))) message = "Enter a valid full name.";
      if (field.name === "phone" && value && !/^01[0125]\d{8}$/.test(value)) message = "Enter an 11-digit Egyptian mobile number.";
      if (field.name === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Enter a valid email address.";
      if (field.name === "address" && value && value.length < 5) message = "Enter a more complete street address.";
      if (field.name === "area" && value && value.length < 2) message = "Enter your area.";
      field.setAttribute("aria-invalid", String(Boolean(message)));
      if (error) error.textContent = message;
      if (message) {
        valid = false;
        firstInvalid ||= field;
        const label = field.closest("label")?.childNodes[0]?.textContent?.trim() || field.name;
        validationMessages.push(`${label}: ${message}`);
      }
    });
    const payment = form.querySelector("[name=payment]:checked");
    if (!payment) {
      document.querySelector("[data-payment-error]").textContent = "Choose a payment method.";
      validationMessages.push("Payment: choose a payment method.");
      valid = false;
    } else if (payment.value !== "cod" && !proofData) {
      document.querySelector("[data-proof-error]").textContent = "Upload your payment screenshot.";
      validationMessages.push("Payment proof: upload the transfer screenshot.");
      valid = false;
    }
    if (!products.length) {
      validationMessages.push("Your bag is empty.");
      valid = false;
    }
    if (!valid) {
      validationSummary.innerHTML = `<b>Please complete the following:</b><ul>${[...new Set(validationMessages)].map(message => `<li>${message}</li>`).join("")}</ul>`;
      validationSummary.hidden = false;
      if (!firstInvalid) validationSummary.scrollIntoView({ behavior: "smooth", block: "center" });
      firstInvalid?.focus();
      firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
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
      localStorage.setItem("curaLastOrder", JSON.stringify(order)); localStorage.removeItem("curaCart"); localStorage.removeItem("curaBuyNow");
      const trackingUrl = `${location.origin}/track-order?order=${encodeURIComponent(order.number)}&token=${encodeURIComponent(order.tracking_token)}`;
      location.href = trackingUrl;
    } catch (error) {
      document.querySelector("[data-payment-error]").textContent = error.message; button.disabled = false; button.textContent = "Place order";
    }
  });
})();
