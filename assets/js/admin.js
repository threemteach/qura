(() => {
  const DEFAULT_CATEGORIES = [
    { id: "skin", label: "Skin care", subcategories: [] }, { id: "hair", label: "Hair care", subcategories: [] },
    { id: "body", label: "Body care", subcategories: [] }, { id: "smile", label: "Smile care", subcategories: [] },
    { id: "baby", label: "Baby & kids", subcategories: ["Shampoo", "Lotion", "Cream", "Oil", "Diaper care", "Sunscreens", "Perfumes", "Baby diapers"] },
    { id: "pads", label: "Pads & tools", subcategories: ["Always", "Sofy", "Mulped", "Private", "Fam", "Fresh days", "Cinderella"] },
    { id: "sun", label: "Sunscreens", subcategories: [] }, { id: "deodorant", label: "Deodorant", subcategories: [] },
    { id: "acne", label: "Acne routines", subcategories: [] }, { id: "lash", label: "Lashes & brows", subcategories: [] },
    { id: "lip", label: "Lip care", subcategories: [] }, { id: "nail", label: "Nail care", subcategories: [] }
  ];
  const GOVERNORATES = ["Cairo", "Giza", "Alexandria", "Dakahlia", "Red Sea", "Beheira", "Fayoum", "Gharbia", "Ismailia", "Monufia", "Minya", "Qalyubia", "New Valley", "Suez", "Aswan", "Assiut", "Beni Suef", "Port Said", "Damietta", "Sharqia", "South Sinai", "Kafr El Sheikh", "Matrouh", "Luxor", "Qena", "North Sinai", "Sohag"];
  const state = { token: sessionStorage.getItem("curaAdminToken") || "", products: [], orders: [], settings: {}, uploadingImage: false, loadedOnce: false };
  const $ = selector => document.querySelector(selector);
  const money = value => `EGP ${Number(value || 0).toLocaleString("en-EG", { maximumFractionDigits: 2 })}`;
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const toast = message => {
    $(".toast").textContent = message;
    $(".toast").classList.add("show");
    setTimeout(() => $(".toast").classList.remove("show"), 2200);
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  };

  function notifyNewOrders(previousOrders, nextOrders) {
    if (!state.loadedOnce || !("Notification" in window) || Notification.permission !== "granted") return;
    const previousIds = new Set(previousOrders.map(order => order.id));
    nextOrders.filter(order => !previousIds.has(order.id)).forEach(order => {
      const notification = new Notification(`New Cura Care order: ${order.order_number}`, {
        body: `${order.customer_name} • ${money(order.total)}`,
        icon: "assets/images/cura-care-logo.png",
        tag: order.id
      });
      notification.onclick = () => { window.focus(); notification.close(); };
    });
  }

  async function load() {
    const previousOrders = state.orders;
    const data = await api("/api/admin?action=dashboard");
    notifyNewOrders(previousOrders, data.orders || []);
    Object.assign(state, data);
    renderProducts();
    renderOrders();
    fillSettings();
    renderCatalog();
    renderDeliveryRates();
    populateCategorySelects();
    state.loadedOnce = true;
    const notificationButton = $("[data-enable-notifications]");
    if ("Notification" in window && Notification.permission === "granted") notificationButton.textContent = "Notifications on";
  }

  function variantPriceMarkup(variant) {
    const current = money(variant.price);
    if (!variant.old_price || Number(variant.old_price) <= Number(variant.price)) return `${escapeHtml(variant.label)}: ${current}`;
    return `${escapeHtml(variant.label)}: <s>${money(variant.old_price)}</s> <b>${current}</b>`;
  }

  function renderProducts(query = "") {
    const normalized = query.trim().toLowerCase();
    const list = state.products.filter(product => `${product.name} ${product.brand} ${product.category}`.toLowerCase().includes(normalized));
    $("[data-product-count]").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
    $("[data-products-table]").innerHTML = list.map(product => `
      <tr>
        <td><img src="${escapeHtml(product.image_url || "assets/images/cura-care-logo.png")}" alt=""> <span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.brand)}</small></span></td>
        <td data-label="Category">${escapeHtml(product.category)}</td>
        <td data-label="Placement">${product.is_bestseller ? '<span class="tag">Best seller</span>' : ""}${product.is_offer ? '<span class="tag">Offer</span>' : ""}</td>
        <td data-label="Prices">${product.product_variants?.map(variant => `<span class="tag">${variantPriceMarkup(variant)}</span>`).join("") || "No sizes"}</td>
        <td data-label="Status">${product.is_active ? "Active" : "Hidden"}</td>
        <td class="row-actions"><button data-edit-product="${product.id}">Edit</button><button data-delete-product="${product.id}">Delete</button></td>
      </tr>`).join("");
  }

  function renderOrders() {
    const completed = state.orders.filter(order => ["delivered", "cancelled"].includes(order.status));
    const reminder = $("[data-cleanup-reminder]");
    reminder.hidden = completed.length === 0;
    reminder.innerHTML = completed.length ? `<b>Storage reminder</b><span>${completed.length} completed order${completed.length === 1 ? "" : "s"} can be deleted when you no longer need them.</span>` : "";
    $("[data-orders-table]").innerHTML = state.orders.map(order => `
      <tr>
        <td><span><b>${escapeHtml(order.order_number)}</b><small>${new Date(order.created_at).toLocaleDateString()}</small></span></td>
        <td data-label="Customer">${escapeHtml(order.customer_name)}<small>${escapeHtml(order.phone)}</small></td>
        <td data-label="Payment">${escapeHtml(order.payment_method)}${order.payment_proof_path ? `<div class="proof-actions"><button class="proof-link" data-view-proof="${escapeHtml(order.payment_proof_path)}">View</button><button class="proof-link" data-download-proof="${escapeHtml(order.payment_proof_path)}">Download</button><button class="proof-delete" data-delete-proof="${order.id}">Delete</button></div>` : ""}</td>
        <td data-label="Total">${money(order.total)}</td>
        <td data-label="Status"><select class="status-select" data-order-status="${order.id}">${["confirmed", "preparing", "on_hold", "out_for_delivery", "delivered", "cancelled"].map(status => `<option value="${status}"${status === order.status ? " selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}</select>${["delivered", "cancelled"].includes(order.status) ? `<button class="delete-completed" data-delete-order="${order.id}">Delete order</button>` : ""}</td>
      </tr>`).join("");
  }

  function fillSettings() {
    Object.entries(state.settings || {}).forEach(([key, value]) => {
      const field = $(`[data-settings-form] [name="${key}"]`);
      if (field) field.value = value ?? "";
    });
  }

  const categories = () => Array.isArray(state.settings.catalog_categories) && state.settings.catalog_categories.length ? state.settings.catalog_categories : DEFAULT_CATEGORIES;
  const deliveryRates = () => Array.isArray(state.settings.delivery_rates) ? state.settings.delivery_rates : [];
  const idFromLabel = label => String(label || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `category-${Date.now()}`;
  async function persistSettings(patch) {
    await api("/api/admin?action=settings", { method: "PATCH", body: JSON.stringify({ settings: patch }) });
    Object.assign(state.settings, patch);
  }
  function categoryOptions(selected = "") {
    return `<option value="">Choose category</option>${categories().map(category => `<option value="${escapeHtml(category.id)}"${category.id === selected ? " selected" : ""}>${escapeHtml(category.label)}</option>`).join("")}`;
  }
  function populateCategorySelects(selectedCategory = "", selectedSubcategory = "") {
    const productCategory = $("[data-product-category]");
    const parentCategory = $("[data-parent-category]");
    productCategory.innerHTML = categoryOptions(selectedCategory || productCategory.value);
    parentCategory.innerHTML = categoryOptions(parentCategory.value);
    const activeId = productCategory.value || selectedCategory;
    const active = categories().find(category => category.id === activeId);
    $("[data-product-subcategory]").innerHTML = `<option value="">Choose subcategory</option>${(active?.subcategories || []).map(name => `<option value="${escapeHtml(name)}"${name === selectedSubcategory ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}`;
  }
  function renderCatalog() {
    $("[data-catalog-list]").innerHTML = categories().map(category => `<article class="catalog-card"><div class="catalog-card-head"><h3>${escapeHtml(category.label)}</h3><button type="button" data-remove-category="${escapeHtml(category.id)}">Delete category</button></div><div class="subcategory-chips">${(category.subcategories || []).map(name => `<span>${escapeHtml(name)} <button type="button" aria-label="Delete subcategory" data-remove-subcategory="${escapeHtml(category.id)}" data-subcategory-name="${escapeHtml(name)}">&times;</button></span>`).join("") || "<small>No subcategories yet</small>"}</div></article>`).join("");
  }
  function renderDeliveryRates() {
    $("[data-governorate-select]").innerHTML = `<option value="">Choose governorate</option>${GOVERNORATES.map(name => `<option>${name}</option>`).join("")}`;
    $("[data-delivery-rates]").innerHTML = deliveryRates().map(rate => `<div class="delivery-rate"><span>${escapeHtml(rate.governorate)}</span><b>${money(rate.fee)}</b><button type="button" data-remove-rate="${escapeHtml(rate.governorate)}">Delete</button></div>`).join("") || "<p class=\"form-help\">No custom prices yet. The default delivery fee is used.</p>";
  }

  function calculateVariant(row) {
    const original = Math.max(0, Number(row.querySelector("[data-original-price]").value || 0));
    const discount = Math.min(99, Math.max(0, Number(row.querySelector("[data-discount]").value || 0)));
    const finalPrice = Math.round((original * (1 - discount / 100) + Number.EPSILON) * 100) / 100;
    const saving = Math.round((original - finalPrice + Number.EPSILON) * 100) / 100;
    row.querySelector("[data-final-price]").value = finalPrice || "";
    row.querySelector('[data-v="old_price"]').value = discount > 0 ? original : "";
    const preview = row.querySelector("[data-price-preview]");
    preview.classList.toggle("has-offer", discount > 0);
    preview.textContent = discount > 0
      ? `Before ${money(original)} → After ${money(finalPrice)} • Customer saves ${money(saving)}`
      : original > 0 ? `Selling price ${money(original)} • No offer applied` : "Enter the original price";
    return { original, discount, finalPrice };
  }

  function addVariant(variant = {}) {
    const fragment = $("[data-variant-template]").content.cloneNode(true);
    const row = fragment.querySelector(".variant-row");
    row.querySelector('[data-v="label"]').value = variant.label || "";
    row.querySelector('[data-v="stock"]').value = variant.stock ?? 1;
    const original = Number(variant.old_price || variant.price || 0);
    const discount = variant.old_price && Number(variant.old_price) > Number(variant.price)
      ? Math.round((1 - Number(variant.price) / Number(variant.old_price)) * 100)
      : 0;
    row.querySelector("[data-original-price]").value = original || "";
    row.querySelector("[data-discount]").value = discount || "";
    calculateVariant(row);
    $("[data-variant-rows]").append(row);
  }

  function slugify(value) {
    const slug = String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return slug || `product-${Date.now()}`;
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) return reject(new Error("Choose a valid image"));
      if (file.size > 15 * 1024 * 1024) return reject(new Error("Original image must be smaller than 15 MB"));
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        const maximum = 1400;
        const scale = Math.min(1, maximum / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        resolve({ dataUrl: canvas.toDataURL("image/webp", 0.78), width: canvas.width, height: canvas.height });
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read this image")); };
      image.src = objectUrl;
    });
  }

  async function uploadProductImage(file) {
    const status = $("[data-image-upload-status]");
    const preview = $("[data-product-image-preview]");
    state.uploadingImage = true;
    status.className = "";
    status.textContent = "Compressing image...";
    try {
      const compressed = await compressImage(file);
      preview.src = compressed.dataUrl;
      status.textContent = `Uploading compressed image (${compressed.width} × ${compressed.height})...`;
      const result = await api("/api/product-image", { method: "POST", body: JSON.stringify({ dataUrl: compressed.dataUrl }) });
      $("[data-product-form]").image_url.value = result.url;
      preview.src = result.url;
      status.className = "success";
      status.textContent = "Image compressed and uploaded successfully.";
    } catch (error) {
      status.className = "error";
      status.textContent = error.message;
    } finally {
      state.uploadingImage = false;
    }
  }

  function openProduct(product) {
    const form = $("[data-product-form]");
    form.reset();
    state.uploadingImage = false;
    $("[data-product-error]").textContent = "";
    $("[data-variant-rows]").innerHTML = "";
    populateCategorySelects(product?.category || "", product?.subcategory || "");
    if (product) Object.entries(product).forEach(([key, value]) => {
      const field = form.elements[key];
      if (field) field.type === "checkbox" ? field.checked = Boolean(value) : field.value = value ?? "";
    });
    $("[data-product-image-preview]").src = product?.image_url || "assets/images/cura-care-logo.png";
    $("[data-image-upload-status]").textContent = product?.image_url ? "Current product image" : "Choose an image from your phone";
    (product?.product_variants?.length ? product.product_variants : [{}]).forEach(addVariant);
    $("[data-product-dialog]").showModal();
  }

  function collectVariants() {
    return [...document.querySelectorAll(".variant-row")].map(row => {
      const { original, discount, finalPrice } = calculateVariant(row);
      return {
        label: row.querySelector('[data-v="label"]').value.trim(),
        price: finalPrice,
        old_price: discount > 0 ? original : null,
        stock: Math.max(0, Number(row.querySelector('[data-v="stock"]').value || 0))
      };
    });
  }

  $("[data-login-form]").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const data = await api("/api/auth", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
      state.token = data.access_token;
      sessionStorage.setItem("curaAdminToken", state.token);
      $("[data-admin-user]").textContent = data.user.email;
      $("[data-admin-login]").hidden = true;
      $("[data-admin-app]").hidden = false;
      await load();
    } catch (error) {
      $("[data-login-error]").textContent = error.message;
    }
  });

  document.addEventListener("click", async event => {
    const tab = event.target.closest("[data-admin-tab]");
    if (tab) {
      document.querySelectorAll("[data-admin-tab]").forEach(button => button.classList.toggle("active", button === tab));
      document.querySelectorAll("[data-panel]").forEach(panel => panel.hidden = panel.dataset.panel !== tab.dataset.adminTab);
      $("[data-admin-title]").textContent = tab.textContent;
    }
    if (event.target.closest("[data-new-product]")) openProduct();
    if (event.target.closest("[data-close-product]")) $("[data-product-dialog]").close();
    const edit = event.target.closest("[data-edit-product]");
    if (edit) openProduct(state.products.find(product => product.id === edit.dataset.editProduct));
    const remove = event.target.closest("[data-delete-product]");
    if (remove && confirm("Delete this product?")) {
      await api(`/api/admin?action=product&id=${remove.dataset.deleteProduct}`, { method: "DELETE" });
      await load();
    }
    if (event.target.closest("[data-add-variant]")) addVariant({});
    if (event.target.closest("[data-remove-variant]")) {
      const rows = document.querySelectorAll(".variant-row");
      if (rows.length === 1) return toast("Every product needs at least one size");
      event.target.closest(".variant-row").remove();
    }
    if (event.target.closest("[data-admin-logout]")) {
      sessionStorage.clear();
      location.reload();
    }
    const removeCategory = event.target.closest("[data-remove-category]");
    if (removeCategory && confirm("Delete this category and its subcategories?")) {
      const next = categories().filter(category => category.id !== removeCategory.dataset.removeCategory);
      await persistSettings({ catalog_categories: next }); renderCatalog(); populateCategorySelects(); toast("Category deleted");
    }
    const removeSubcategory = event.target.closest("[data-remove-subcategory]");
    if (removeSubcategory) {
      const next = categories().map(category => category.id === removeSubcategory.dataset.removeSubcategory ? { ...category, subcategories: (category.subcategories || []).filter(name => name !== removeSubcategory.dataset.subcategoryName) } : category);
      await persistSettings({ catalog_categories: next }); renderCatalog(); populateCategorySelects(); toast("Subcategory deleted");
    }
    const removeRate = event.target.closest("[data-remove-rate]");
    if (removeRate) {
      const next = deliveryRates().filter(rate => rate.governorate !== removeRate.dataset.removeRate);
      await persistSettings({ delivery_rates: next }); renderDeliveryRates(); toast("Delivery price deleted");
    }
    const proofButton = event.target.closest("[data-view-proof]");
    if (proofButton) {
      try {
        const result = await api(`/api/admin?action=payment-proof&path=${encodeURIComponent(proofButton.dataset.viewProof)}`);
        window.open(result.url, "_blank", "noopener");
      } catch (error) { toast(error.message); }
    }
    const downloadProof = event.target.closest("[data-download-proof]");
    if (downloadProof) {
      try {
        const result = await api(`/api/admin?action=payment-proof&download=1&path=${encodeURIComponent(downloadProof.dataset.downloadProof)}`);
        location.href = result.url;
      } catch (error) { toast(error.message); }
    }
    const deleteProof = event.target.closest("[data-delete-proof]");
    if (deleteProof && confirm("Permanently delete this payment proof from storage?")) {
      try {
        await api(`/api/admin?action=payment-proof&id=${encodeURIComponent(deleteProof.dataset.deleteProof)}`, { method: "DELETE" });
        toast("Payment proof deleted");
        await load();
      } catch (error) { toast(error.message); }
    }
    const deleteOrder = event.target.closest("[data-delete-order]");
    if (deleteOrder && confirm("Permanently delete this completed order, its items, and payment proof?")) {
      try {
        await api(`/api/admin?action=order&id=${encodeURIComponent(deleteOrder.dataset.deleteOrder)}`, { method: "DELETE" });
        toast("Completed order deleted");
        await load();
      } catch (error) { toast(error.message); }
    }
    if (event.target.closest("[data-enable-notifications]")) {
      if (!("Notification" in window)) return toast("Notifications are not supported on this browser");
      const permission = await Notification.requestPermission();
      event.target.closest("[data-enable-notifications]").textContent = permission === "granted" ? "Notifications on" : "Notifications blocked";
      toast(permission === "granted" ? "New order notifications enabled" : "Allow notifications from browser settings");
    }
  });

  document.addEventListener("input", event => {
    const row = event.target.closest(".variant-row");
    if (row && (event.target.matches("[data-original-price]") || event.target.matches("[data-discount]"))) {
      calculateVariant(row);
      if (Number(event.target.closest(".variant-row").querySelector("[data-discount]").value || 0) > 0) {
        $("[data-product-form]").is_offer.checked = true;
      }
    }
  });
  $("[data-product-category]").addEventListener("change", event => populateCategorySelects(event.target.value, ""));
  $("[data-product-image-file]").addEventListener("change", event => {
    const file = event.target.files[0];
    if (file) uploadProductImage(file);
  });

  $("[data-category-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const label = event.target.category_name.value.trim();
    if (!label) return;
    const next = [...categories(), { id: idFromLabel(label), label, subcategories: [] }];
    await persistSettings({ catalog_categories: next }); event.target.reset(); renderCatalog(); populateCategorySelects(); toast("Category added");
  });
  $("[data-subcategory-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const parent = event.target.parent_category.value;
    const name = event.target.subcategory_name.value.trim();
    const next = categories().map(category => category.id === parent ? { ...category, subcategories: [...new Set([...(category.subcategories || []), name])] } : category);
    await persistSettings({ catalog_categories: next }); event.target.reset(); renderCatalog(); populateCategorySelects(); toast("Subcategory added");
  });
  $("[data-delivery-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const governorate = event.target.governorate.value;
    const fee = Math.max(0, Number(event.target.fee.value || 0));
    const next = [...deliveryRates().filter(rate => rate.governorate !== governorate), { governorate, fee }].sort((a, b) => a.governorate.localeCompare(b.governorate));
    await persistSettings({ delivery_rates: next }); event.target.reset(); renderDeliveryRates(); toast("Delivery price saved");
  });

  $("[data-product-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
    if (state.uploadingImage) {
      $("[data-product-error]").textContent = "Wait for the image upload to finish.";
      return;
    }
    const raw = Object.fromEntries(new FormData(form));
    const variants = collectVariants();
    if (variants.some(variant => !variant.label || variant.price <= 0)) {
      $("[data-product-error]").textContent = "Add a size and a valid original price.";
      return;
    }
    const product = {
      ...raw,
      id: raw.id || undefined,
      slug: raw.slug.trim() || slugify(raw.name),
      is_active: form.is_active.checked,
      is_bestseller: form.is_bestseller.checked,
      is_offer: form.is_offer.checked || variants.some(variant => variant.old_price),
      variants
    };
    try {
      await api("/api/admin?action=product", { method: raw.id ? "PATCH" : "POST", body: JSON.stringify({ product }) });
      $("[data-product-dialog]").close();
      toast("Product saved");
      await load();
    } catch (error) {
      $("[data-product-error]").textContent = error.message;
    }
  });

  $("[data-settings-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const settings = Object.fromEntries(new FormData(event.target));
    settings.delivery_fee = Number(settings.delivery_fee);
    settings.free_delivery_from = Number(settings.free_delivery_from || 0);
    await api("/api/admin?action=settings", { method: "PATCH", body: JSON.stringify({ settings }) });
    toast("Settings saved");
  });
  $("[data-admin-search]").addEventListener("input", event => renderProducts(event.target.value));
  document.addEventListener("change", async event => {
    if (event.target.matches("[data-order-status]")) {
      if (event.target.value === "cancelled" && !confirm("Cancel this order and return its quantities to stock?")) {
        await load();
        return;
      }
      try {
        const result = await api("/api/admin?action=order", { method: "PATCH", body: JSON.stringify({ id: event.target.dataset.orderStatus, status: event.target.value }) });
        toast(result.cancelled ? "Order cancelled and stock restored" : event.target.value === "delivered" ? "Order delivered — delete it later when no longer needed" : event.target.value === "on_hold" ? "Order placed on hold" : "Delivery status updated");
        await load();
      } catch (error) { toast(error.message); await load(); }
    }
  });

  if (state.token) api("/api/auth").then(data => {
    $("[data-admin-user]").textContent = data.user.email;
    $("[data-admin-login]").hidden = true;
    $("[data-admin-app]").hidden = false;
    load();
  }).catch(() => sessionStorage.clear());
  setInterval(() => { if (state.token && !$("[data-admin-app]").hidden) load().catch(() => {}); }, 30000);
})();
