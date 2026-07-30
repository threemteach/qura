(() => {
  const state = { token: sessionStorage.getItem("curaAdminToken") || "", products: [], orders: [], settings: {} };
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

  async function load() {
    const data = await api("/api/admin?action=dashboard");
    Object.assign(state, data);
    renderProducts();
    renderOrders();
    fillSettings();
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
    $("[data-orders-table]").innerHTML = state.orders.map(order => `
      <tr>
        <td><span><b>${escapeHtml(order.order_number)}</b><small>${new Date(order.created_at).toLocaleDateString()}</small></span></td>
        <td data-label="Customer">${escapeHtml(order.customer_name)}<small>${escapeHtml(order.phone)}</small></td>
        <td data-label="Payment">${escapeHtml(order.payment_method)}</td>
        <td data-label="Total">${money(order.total)}</td>
        <td data-label="Status"><select class="status-select" data-order-status="${order.id}">${["confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"].map(status => `<option value="${status}"${status === order.status ? " selected" : ""}>${status.replaceAll("_", " ")}</option>`).join("")}</select></td>
      </tr>`).join("");
  }

  function fillSettings() {
    Object.entries(state.settings || {}).forEach(([key, value]) => {
      const field = $(`[data-settings-form] [name="${key}"]`);
      if (field) field.value = value ?? "";
    });
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
    row.querySelector('[data-v="stock"]').value = variant.stock ?? 0;
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

  function openProduct(product) {
    const form = $("[data-product-form]");
    form.reset();
    $("[data-product-error]").textContent = "";
    $("[data-variant-rows]").innerHTML = "";
    if (product) Object.entries(product).forEach(([key, value]) => {
      const field = form.elements[key];
      if (field) field.type === "checkbox" ? field.checked = Boolean(value) : field.value = value ?? "";
    });
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

  $("[data-product-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target;
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
      await api("/api/admin?action=order", { method: "PATCH", body: JSON.stringify({ id: event.target.dataset.orderStatus, status: event.target.value }) });
      toast("Delivery status updated");
    }
  });

  if (state.token) api("/api/auth").then(data => {
    $("[data-admin-user]").textContent = data.user.email;
    $("[data-admin-login]").hidden = true;
    $("[data-admin-app]").hidden = false;
    load();
  }).catch(() => sessionStorage.clear());
})();
