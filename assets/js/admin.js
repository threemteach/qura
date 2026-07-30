(() => {
  const state = { token: sessionStorage.getItem("curaAdminToken") || "", products: [], orders: [], settings: {} };
  const $ = selector => document.querySelector(selector);
  const toast = message => { $(".toast").textContent = message; $(".toast").classList.add("show"); setTimeout(() => $(".toast").classList.remove("show"), 2200); };
  const api = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Request failed");
    return body;
  };
  async function load() {
    const data = await api("/api/admin?action=dashboard");
    Object.assign(state, data); renderProducts(); renderOrders(); fillSettings();
  }
  function renderProducts(query = "") {
    const list = state.products.filter(product => `${product.name} ${product.brand}`.toLowerCase().includes(query.toLowerCase()));
    $("[data-products-table]").innerHTML = list.map(product => `<tr><td><img src="${product.image_url || "assets/images/cura-care-logo.png"}" alt="">${product.name}<small>${product.brand}</small></td><td>${product.category}</td><td>${product.is_bestseller ? '<span class="tag">Best seller</span>' : ""}${product.is_offer ? '<span class="tag">Offer</span>' : ""}</td><td>${product.product_variants?.map(v => `<span class="tag">${v.label}: EGP ${v.price}</span>`).join("") || "—"}</td><td>${product.is_active ? "Active" : "Hidden"}</td><td class="row-actions"><button data-edit-product="${product.id}">Edit</button> <button data-delete-product="${product.id}">Delete</button></td></tr>`).join("");
  }
  function renderOrders() {
    $("[data-orders-table]").innerHTML = state.orders.map(order => `<tr><td><b>${order.order_number}</b><small>${new Date(order.created_at).toLocaleDateString()}</small></td><td>${order.customer_name}<small>${order.phone}</small></td><td>${order.payment_method}</td><td>EGP ${Number(order.total).toLocaleString()}</td><td><select class="status-select" data-order-status="${order.id}">${["confirmed","preparing","out_for_delivery","delivered","cancelled"].map(status => `<option value="${status}"${status === order.status ? " selected" : ""}>${status.replaceAll("_"," ")}</option>`).join("")}</select></td></tr>`).join("");
  }
  function fillSettings() { Object.entries(state.settings || {}).forEach(([key, value]) => { const field = $(`[data-settings-form] [name="${key}"]`); if (field) field.value = value ?? ""; }); }
  function addVariant(variant = {}) {
    const row = $("[data-variant-template]").content.cloneNode(true);
    Object.entries(variant).forEach(([key, value]) => { const input = row.querySelector(`[data-v="${key === "old_price" ? "old_price" : key}"]`); if (input) input.value = value ?? ""; });
    $("[data-variant-rows]").append(row);
  }
  function openProduct(product) {
    const form = $("[data-product-form]"); form.reset(); $("[data-variant-rows]").innerHTML = "";
    if (product) Object.entries(product).forEach(([key, value]) => { const field = form.elements[key]; if (field) field.type === "checkbox" ? field.checked = !!value : field.value = value ?? ""; });
    (product?.product_variants || [{}]).forEach(addVariant); $("[data-product-dialog]").showModal();
  }
  $("[data-login-form]").addEventListener("submit", async event => {
    event.preventDefault(); try { const data = await api("/api/auth", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); state.token = data.access_token; sessionStorage.setItem("curaAdminToken", state.token); $("[data-admin-user]").textContent = data.user.email; $("[data-admin-login]").hidden = true; $("[data-admin-app]").hidden = false; await load(); } catch (error) { $("[data-login-error]").textContent = error.message; }
  });
  document.addEventListener("click", async event => {
    const tab = event.target.closest("[data-admin-tab]"); if (tab) { document.querySelectorAll("[data-admin-tab]").forEach(b => b.classList.toggle("active", b === tab)); document.querySelectorAll("[data-panel]").forEach(p => p.hidden = p.dataset.panel !== tab.dataset.adminTab); $("[data-admin-title]").textContent = tab.textContent; }
    if (event.target.closest("[data-new-product]")) openProduct();
    const edit = event.target.closest("[data-edit-product]"); if (edit) openProduct(state.products.find(p => p.id === edit.dataset.editProduct));
    const remove = event.target.closest("[data-delete-product]"); if (remove && confirm("Delete this product?")) { await api(`/api/admin?action=product&id=${remove.dataset.deleteProduct}`, { method: "DELETE" }); await load(); }
    if (event.target.closest("[data-add-variant]")) addVariant({});
    if (event.target.closest("[data-remove-variant]")) event.target.closest(".variant-row").remove();
    if (event.target.closest("[data-admin-logout]")) { sessionStorage.clear(); location.reload(); }
  });
  $("[data-product-form]").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.target; const raw = Object.fromEntries(new FormData(form)); const variants = [...document.querySelectorAll(".variant-row")].map(row => Object.fromEntries([...row.querySelectorAll("[data-v]")].map(input => [input.dataset.v, input.type === "number" ? Number(input.value || 0) : input.value])));
    const product = { ...raw, id: raw.id || undefined, is_active: form.is_active.checked, is_bestseller: form.is_bestseller.checked, is_offer: form.is_offer.checked, variants };
    try { await api("/api/admin?action=product", { method: raw.id ? "PATCH" : "POST", body: JSON.stringify({ product }) }); $("[data-product-dialog]").close(); toast("Product saved"); await load(); } catch (error) { $("[data-product-error]").textContent = error.message; }
  });
  $("[data-settings-form]").addEventListener("submit", async event => { event.preventDefault(); const settings = Object.fromEntries(new FormData(event.target)); settings.delivery_fee = Number(settings.delivery_fee); settings.free_delivery_from = Number(settings.free_delivery_from || 0); await api("/api/admin?action=settings", { method: "PATCH", body: JSON.stringify({ settings }) }); toast("Settings saved"); });
  $("[data-admin-search]").addEventListener("input", event => renderProducts(event.target.value));
  document.addEventListener("change", async event => { if (event.target.matches("[data-order-status]")) { await api("/api/admin?action=order", { method: "PATCH", body: JSON.stringify({ id: event.target.dataset.orderStatus, status: event.target.value }) }); toast("Delivery status updated"); } });
  if (state.token) api("/api/auth").then(data => { $("[data-admin-user]").textContent = data.user.email; $("[data-admin-login]").hidden = true; $("[data-admin-app]").hidden = false; load(); }).catch(() => sessionStorage.clear());
})();
