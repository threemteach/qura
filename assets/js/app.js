(() => {
  const data = window.CURA_DATA;
  const money = value => `EGP ${value.toLocaleString("en-EG")}`;
  const $ = selector => document.querySelector(selector);
  const cart = JSON.parse(localStorage.getItem("curaCart") || "[]");
  let activeFilter = "all";

  const categoryGrid = $("[data-category-grid]");
  categoryGrid.innerHTML = data.categories.map((category, index) => `
    <button class="category-card" data-category="${category.id}" style="--delay:${index * 20}ms">
      <span class="category-icon" aria-hidden="true">${category.icon}</span>
      <span><b>${category.name}</b><small>${category.subtitle}</small></span>
      <i aria-hidden="true">→</i>
    </button>`).join("");

  const chips = [{ id: "all", name: "All" }, ...data.categories];
  $("[data-filter-chips]").innerHTML = chips.map(c => `<button class="chip${c.id === "all" ? " active" : ""}" data-filter="${c.id}">${c.name}</button>`).join("");

  function productCard(product) {
    return `<article class="product-card">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        ${product.badge ? `<span class="badge">${product.badge}</span>` : ""}
        <button class="wish" type="button" aria-label="Add ${product.name} to wishlist">♡</button>
      </div>
      <div class="product-info"><small>${product.brand}</small><h3>${product.name}</h3>
        <div class="rating" aria-label="Rated 4.8 out of 5">★★★★★ <span>4.8</span></div>
        <div class="price"><b>${money(product.price)}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ""}</div>
        <button class="button button-secondary add-cart" data-add="${product.id}" type="button">Add to bag</button>
      </div>
    </article>`;
  }

  function renderProducts() {
    const list = activeFilter === "all" ? data.products : data.products.filter(p => p.category === activeFilter);
    $("[data-product-grid]").innerHTML = list.map(productCard).join("");
    $("[data-empty]").hidden = list.length > 0;
  }

  function saveCart() {
    localStorage.setItem("curaCart", JSON.stringify(cart));
    document.querySelectorAll("[data-cart-count]").forEach(el => el.textContent = cart.reduce((sum, item) => sum + item.qty, 0));
    $("[data-cart-items]").innerHTML = cart.length ? cart.map(item => {
      const product = data.products.find(p => p.id === item.id);
      return `<div class="cart-item"><img src="${product.image}" alt=""><div><b>${product.name}</b><small>${money(product.price)} × ${item.qty}</small></div><button data-remove="${item.id}" aria-label="Remove ${product.name}">×</button></div>`;
    }).join("") : `<p class="cart-empty">Your bag is waiting for something lovely.</p>`;
    const total = cart.reduce((sum, item) => sum + data.products.find(p => p.id === item.id).price * item.qty, 0);
    $("[data-cart-total]").textContent = money(total);
  }

  function showLayer(type, open) {
    const panel = type === "cart" ? $(".cart-panel") : $(".drawer");
    panel.classList.toggle("open", open);
    panel.setAttribute("aria-hidden", String(!open));
    $(".overlay").hidden = !open;
    document.body.classList.toggle("no-scroll", open);
  }

  function toast(message) {
    $(".toast").textContent = message;
    $(".toast").classList.add("show");
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => $(".toast").classList.remove("show"), 2200);
  }

  document.addEventListener("click", event => {
    const category = event.target.closest("[data-category]");
    const filter = event.target.closest("[data-filter]");
    const add = event.target.closest("[data-add]");
    const remove = event.target.closest("[data-remove]");
    if (category) {
      activeFilter = category.dataset.category;
      document.querySelector(`[data-filter="${activeFilter}"]`)?.click();
      $("#products").scrollIntoView({ behavior: "smooth" });
    }
    if (filter) {
      activeFilter = filter.dataset.filter;
      document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === filter));
      renderProducts();
    }
    if (add) {
      const id = Number(add.dataset.add);
      const item = cart.find(i => i.id === id);
      item ? item.qty++ : cart.push({ id, qty: 1 });
      saveCart(); toast("Added to your bag");
    }
    if (remove) {
      cart.splice(cart.findIndex(i => i.id === Number(remove.dataset.remove)), 1);
      saveCart();
    }
    if (event.target.closest(".menu-button")) showLayer("menu", true);
    if (event.target.closest(".cart-button")) showLayer("cart", true);
    if (event.target.closest(".drawer-close")) showLayer("menu", false);
    if (event.target.closest(".cart-head button")) showLayer("cart", false);
    if (event.target === $(".overlay")) { showLayer("menu", false); showLayer("cart", false); }
    if (event.target.closest(".wish")) {
      const button = event.target.closest(".wish");
      button.classList.toggle("active");
      button.textContent = button.classList.contains("active") ? "♥" : "♡";
      toast(button.classList.contains("active") ? "Saved to wishlist" : "Removed from wishlist");
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { showLayer("menu", false); showLayer("cart", false); }
  });
  $("[data-show-all]").addEventListener("click", () => document.querySelector('[data-filter="all"]').click());
  $("[data-newsletter]").addEventListener("submit", event => { event.preventDefault(); event.target.reset(); toast("Welcome to Cura Care"); });
  renderProducts();
  saveCart();
})();
