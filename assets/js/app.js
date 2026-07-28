(() => {
  const data = window.CURA_DATA;
  const money = value => `EGP ${value.toLocaleString("en-EG")}`;
  const $ = selector => document.querySelector(selector);
  const cart = JSON.parse(localStorage.getItem("curaCart") || "[]");
  let activeFilter = "all";
  let activeSubFilter = "all";
  let activeSort = "featured";
  let searchQuery = "";

  function renderMainFilters() {
    const filters = [{ id: "all", name: "All products", icon: "✦" }, ...data.categories];
    $("[data-main-filters]").innerHTML = filters.map(category => {
      const count = category.id === "all" ? data.products.length : data.products.filter(product => product.category === category.id).length;
      return `<button class="main-filter${category.id === activeFilter ? " active" : ""}" data-filter="${category.id}">
        <span aria-hidden="true">${category.icon}</span><b>${category.name}</b><small>${count}</small>
      </button>`;
    }).join("");
  }

  function renderSubFilters() {
    const category = data.categories.find(item => item.id === activeFilter);
    const wrap = $("[data-sub-filter-wrap]");
    if (!category) {
      wrap.hidden = true;
      $("[data-sub-filters]").innerHTML = "";
      return;
    }
    wrap.hidden = false;
    const subs = ["all", ...category.subs];
    $("[data-sub-filters]").innerHTML = subs.map(sub => {
      const label = sub === "all" ? `All ${category.name}` : sub;
      return `<button class="chip${sub === activeSubFilter ? " active" : ""}" data-sub-filter="${sub}">${label}</button>`;
    }).join("");
  }

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

  function shelfCard(product) {
    return `<article class="shelf-card" data-product-focus="${product.id}" tabindex="0" role="button" aria-label="View ${product.name}">
      <div class="shelf-image"><img src="${product.image}" alt="${product.name}" loading="lazy">${product.badge ? `<span>${product.badge}</span>` : ""}</div>
      <div><small>${product.brand}</small><h3>${product.name}</h3><p><b>${money(product.price)}</b>${product.oldPrice ? `<s>${money(product.oldPrice)}</s>` : ""}</p></div>
      <button class="shelf-add" data-add="${product.id}" type="button" aria-label="Add ${product.name} to bag">+</button>
    </article>`;
  }

  function renderShelves() {
    const bestsellers = data.products.filter(product => ["BESTSELLER", "LOVED", "SUMMER PICK", "ROUTINE"].includes(product.badge)).slice(0, 5);
    const offers = data.products.filter(product => product.oldPrice).slice(0, 5);
    const loop = products => {
      const cards = products.map(shelfCard).join("");
      return `<div class="shelf-loop"><div class="shelf-group">${cards}</div><div class="shelf-group" aria-hidden="true" inert>${cards}</div></div>`;
    };
    $("[data-bestseller-shelf]").innerHTML = loop(bestsellers);
    $("[data-offer-shelf]").innerHTML = loop(offers);
  }

  function renderProducts() {
    let list = activeFilter === "all" ? [...data.products] : data.products.filter(p => p.category === activeFilter);
    if (activeSubFilter !== "all") list = list.filter(product => product.subcategory === activeSubFilter);
    if (searchQuery) {
      list = list.filter(product => `${product.name} ${product.brand} ${product.subcategory}`.toLowerCase().includes(searchQuery));
    }
    if (activeSort === "price-low") list.sort((a, b) => a.price - b.price);
    if (activeSort === "price-high") list.sort((a, b) => b.price - a.price);
    if (activeSort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    const category = data.categories.find(item => item.id === activeFilter);
    const path = searchQuery ? `Results for “${searchQuery}”` : activeFilter === "all" ? "All products" : `${category.name}${activeSubFilter !== "all" ? ` / ${activeSubFilter}` : ""}`;
    $("[data-active-path]").textContent = path;
    $("[data-mobile-filter-label]").textContent = path;
    $("[data-result-count]").textContent = `${list.length} ${list.length === 1 ? "product" : "products"}`;
    $("[data-product-grid]").innerHTML = list.map(productCard).join("");
    $("[data-empty]").hidden = list.length > 0;
  }

  function applyFilter(categoryId) {
    activeFilter = categoryId;
    activeSubFilter = "all";
    renderMainFilters();
    renderSubFilters();
    renderProducts();
    $(".catalog-sidebar").classList.remove("mobile-open");
    $("[data-mobile-filter-toggle]").setAttribute("aria-expanded", "false");
  }

  function applySearch(value) {
    searchQuery = value.trim().toLowerCase();
    const catalogInput = $("[data-product-search]");
    if (catalogInput.value !== value) catalogInput.value = value;
    renderProducts();
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
    const subFilter = event.target.closest("[data-sub-filter]");
    const add = event.target.closest("[data-add]");
    const remove = event.target.closest("[data-remove]");
    const shelfView = event.target.closest("[data-shelf-view]");
    const productFocus = event.target.closest("[data-product-focus]");
    const shortcut = event.target.closest("[data-shortcut]");
    if (category) {
      applyFilter(category.dataset.category);
      $("#products").scrollIntoView({ behavior: "smooth" });
    }
    if (filter) {
      applyFilter(filter.dataset.filter);
    }
    if (subFilter) {
      activeSubFilter = subFilter.dataset.subFilter;
      document.querySelectorAll("[data-sub-filter]").forEach(chip => chip.classList.toggle("active", chip === subFilter));
      renderProducts();
    }
    if (shortcut) {
      applyFilter(shortcut.dataset.shortcut);
      $("#products").scrollIntoView({ behavior: "smooth" });
    }
    if (productFocus && !add) {
      const product = data.products.find(item => item.id === Number(productFocus.dataset.productFocus));
      applyFilter(product.category);
      applySearch(product.name);
      $("#products").scrollIntoView({ behavior: "smooth" });
    }
    if (shelfView) {
      searchQuery = "";
      $("[data-product-search]").value = "";
      if (shelfView.dataset.shelfView === "offers") {
        activeFilter = "all";
        activeSubFilter = "all";
        activeSort = "featured";
        renderMainFilters(); renderSubFilters();
        const offerProducts = data.products.filter(product => product.oldPrice);
        $("[data-active-path]").textContent = "Current offers";
        $("[data-mobile-filter-label]").textContent = "Current offers";
        $("[data-result-count]").textContent = `${offerProducts.length} products`;
        $("[data-product-grid]").innerHTML = offerProducts.map(productCard).join("");
      } else {
        activeFilter = "all";
        activeSubFilter = "all";
        renderMainFilters(); renderSubFilters();
        const lovedProducts = data.products.filter(product => ["BESTSELLER", "LOVED", "SUMMER PICK", "ROUTINE"].includes(product.badge));
        $("[data-active-path]").textContent = "Best sellers";
        $("[data-mobile-filter-label]").textContent = "Best sellers";
        $("[data-result-count]").textContent = `${lovedProducts.length} products`;
        $("[data-product-grid]").innerHTML = lovedProducts.map(productCard).join("");
      }
      $("#products").scrollIntoView({ behavior: "smooth" });
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
    if (event.target.closest("[data-mobile-filter-toggle]")) {
      const sidebar = $(".catalog-sidebar");
      const open = sidebar.classList.toggle("mobile-open");
      $("[data-mobile-filter-toggle]").setAttribute("aria-expanded", String(open));
    }
  });

  document.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-product-focus]")) {
      event.preventDefault();
      event.target.click();
    }
    if (event.key === "Escape") { showLayer("menu", false); showLayer("cart", false); }
  });
  $("[data-sort]").addEventListener("change", event => {
    activeSort = event.target.value;
    renderProducts();
  });
  $("[data-product-search]").addEventListener("input", event => applySearch(event.target.value));
  $("[data-header-search]").addEventListener("submit", event => {
    event.preventDefault();
    applySearch($("#header-product-search").value);
    $("#products").scrollIntoView({ behavior: "smooth" });
  });
  $("[data-clear-filters]").addEventListener("click", () => {
    searchQuery = "";
    $("[data-product-search]").value = "";
    $("#header-product-search").value = "";
    applyFilter("all");
  });
  $("[data-show-all]").addEventListener("click", () => document.querySelector('[data-filter="all"]').click());
  $("[data-newsletter]").addEventListener("submit", event => { event.preventDefault(); event.target.reset(); toast("Welcome to Cura Care"); });
  renderMainFilters();
  renderSubFilters();
  renderShelves();
  renderProducts();
  saveCart();
})();
