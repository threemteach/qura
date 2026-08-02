(() => {
  const data = window.CURA_DATA;
  const money = value => `EGP ${value.toLocaleString("en-EG")}`;
  const $ = selector => document.querySelector(selector);
  const cart = JSON.parse(localStorage.getItem("curaCart") || "[]");
  let activeFilter = "all";
  let activeSubFilter = "all";
  let activeSort = "featured";
  let searchQuery = "";
  const findProduct = id => data.products.find(product => String(product.id) === String(id));
  const availableStock = (product, variantId) => {
    const variant = variantsFor(product).find(item => String(item.id) === String(variantId));
    return variant?.stock == null ? Infinity : Number(variant.stock);
  };

  const variantsFor = product => {
    const remote = product.product_variants || product.variants;
    if (remote?.length) return remote.map(variant => ({ id: variant.id || variant.label, label: variant.label, price: Number(variant.price), oldPrice: variant.old_price ?? variant.oldPrice, stock: variant.stock == null ? null : Number(variant.stock) }));
    const unit = ["body", "hair", "baby", "sun"].includes(product.category) ? "ml" : "g";
    return [
      { id: `${product.id}-small`, label: `50 ${unit}`, price: product.price, oldPrice: product.oldPrice },
      { id: `${product.id}-large`, label: `100 ${unit}`, price: Math.round(product.price * 1.65), oldPrice: product.oldPrice ? Math.round(product.oldPrice * 1.65) : null }
    ];
  };

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
    const variants = variantsFor(product);
    const selected = variants.find(variant => variant.stock !== 0) || variants[0];
    const soldOut = variants.every(variant => variant.stock === 0);
    return `<article class="product-card">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}" loading="lazy">
        ${product.badge ? `<span class="badge">${product.badge}</span>` : ""}
      </div>
      <div class="product-info"><small>${product.brand}</small><h3>${product.name}</h3>
        <div class="rating" aria-label="Rated 4.8 out of 5">★★★★★ <span>4.8</span></div>
        <label class="variant-picker"><span>Size</span><select data-variant>${variants.map(variant => `<option value="${variant.id}" data-price="${variant.price}" data-old-price="${variant.oldPrice || ""}" data-stock="${variant.stock ?? ""}"${variant.id === selected.id ? " selected" : ""}${variant.stock === 0 ? " disabled" : ""}>${variant.label}${variant.stock === 0 ? " — Sold out" : ""}</option>`).join("")}</select></label>
        <div class="price"><b>${money(selected.price)}</b><s${selected.oldPrice ? "" : " hidden"}>${selected.oldPrice ? money(selected.oldPrice) : ""}</s></div>
        <div class="card-quantity"><span>Quantity</span><div><button type="button" data-card-quantity="minus" aria-label="Reduce quantity">−</button><b data-card-quantity-value>1</b><button type="button" data-card-quantity="plus" aria-label="Increase quantity">+</button></div></div>
        <div class="product-actions"><button class="button button-secondary add-cart" data-add="${product.id}" type="button"${soldOut ? " disabled" : ""}>${soldOut ? "Sold out" : "Add to bag"}</button><button class="button button-primary buy-now" data-buy-now="${product.id}" type="button"${soldOut ? " disabled" : ""}>Buy now</button></div>
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
      const product = findProduct(item.id);
      if (!product) return "";
      return `<div class="cart-item"><img src="${product.image}" alt=""><div><b>${product.name}</b><small>${item.variantLabel || "Standard"} · ${money(item.price || product.price)}</small><div class="cart-quantity"><button data-quantity="minus" data-key="${item.key || item.id}" type="button" aria-label="Reduce quantity">−</button><span>${item.qty}</span><button data-quantity="plus" data-key="${item.key || item.id}" type="button" aria-label="Increase quantity">+</button></div></div><button class="cart-remove" data-remove-key="${item.key || item.id}" aria-label="Remove ${product.name}">×</button></div>`;
    }).join("") : `<p class="cart-empty">Your bag is waiting for something lovely.</p>`;
    const total = cart.reduce((sum, item) => sum + (item.price || findProduct(item.id)?.price || 0) * item.qty, 0);
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
    const buyNow = event.target.closest("[data-buy-now]");
    const remove = event.target.closest("[data-remove-key]");
    const quantity = event.target.closest("[data-quantity]");
    const cardQuantity = event.target.closest("[data-card-quantity]");
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
    if (productFocus && !add && !buyNow && !cardQuantity) {
      const product = findProduct(productFocus.dataset.productFocus);
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
      const id = add.dataset.add;
      const product = findProduct(id);
      const card = add.closest(".product-card");
      const requestedQty = Number(card?.querySelector("[data-card-quantity-value]")?.textContent || 1);
      const select = card?.querySelector("[data-variant]");
      const option = select?.selectedOptions[0];
      const fallbackVariant = variantsFor(product).find(variant => variant.stock !== 0) || variantsFor(product)[0];
      const variantId = option?.value || fallbackVariant?.id || `${id}-default`;
      const key = `${id}:${variantId}`;
      const item = cart.find(i => (i.key || `${i.id}:legacy`) === key);
      const stock = availableStock(product, variantId);
      if ((item?.qty || 0) + requestedQty > stock) return toast(`Only ${stock} available in stock`);
      item ? item.qty += requestedQty : cart.push({ id, key, variantId, variantLabel: option?.textContent || fallbackVariant?.label || "Standard", price: Number(option?.dataset.price) || fallbackVariant?.price || product.price, qty: requestedQty });
      saveCart(); toast("Added to your bag");
    }
    if (buyNow) {
      const id = buyNow.dataset.buyNow;
      const card = buyNow.closest(".product-card");
      const requestedQty = Number(card?.querySelector("[data-card-quantity-value]")?.textContent || 1);
      const select = card?.querySelector("[data-variant]");
      const option = select?.selectedOptions[0];
      const variantId = option?.value || `${id}-default`;
      const stock = availableStock(findProduct(id), variantId);
      if (requestedQty > stock) return toast(`Only ${stock} available in stock`);
      localStorage.setItem("curaBuyNow", JSON.stringify([{ id, key: `${id}:${variantId}`, variantId, variantLabel: option?.textContent || "Standard", price: Number(option?.dataset.price) || findProduct(id).price, qty: requestedQty }]));
      location.href = "/checkout";
    }
    if (event.target.closest("[data-cart-checkout]")) localStorage.removeItem("curaBuyNow");
    if (remove) {
      cart.splice(cart.findIndex(i => String(i.key || i.id) === remove.dataset.removeKey), 1);
      saveCart();
    }
    if (quantity) {
      const item = cart.find(entry => String(entry.key || entry.id) === quantity.dataset.key);
      if (item) {
        if (quantity.dataset.quantity === "plus") {
          const product = findProduct(item.id);
          const stock = availableStock(product, item.variantId);
          if (item.qty >= stock) return toast(`Only ${stock} available in stock`);
          item.qty++;
        } else item.qty--;
        if (item.qty <= 0) cart.splice(cart.indexOf(item), 1);
        saveCart();
      }
    }
    if (cardQuantity) {
      const card = cardQuantity.closest(".product-card");
      const value = card.querySelector("[data-card-quantity-value]");
      const current = Number(value.textContent || 1);
      const option = card.querySelector("[data-variant]").selectedOptions[0];
      const stock = option.dataset.stock === "" ? Infinity : Number(option.dataset.stock);
      if (cardQuantity.dataset.cardQuantity === "plus" && current >= stock) return toast(`Only ${stock} available in stock`);
      value.textContent = cardQuantity.dataset.cardQuantity === "plus" ? Math.min(99, current + 1) : Math.max(1, current - 1);
    }
    if (event.target.closest(".menu-button")) showLayer("menu", true);
    if (event.target.closest(".cart-button")) showLayer("cart", true);
    if (event.target.closest("[data-open-cart]")) {
      event.preventDefault();
      showLayer("menu", false);
      showLayer("cart", true);
    }
    if (event.target.closest(".drawer-close")) showLayer("menu", false);
    if (event.target.closest(".drawer a") && !event.target.closest("[data-open-cart]")) showLayer("menu", false);
    if (event.target.closest(".cart-head button")) showLayer("cart", false);
    if (event.target === $(".overlay")) { showLayer("menu", false); showLayer("cart", false); }
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
    if (event.key === "Escape") {
      showLayer("menu", false); showLayer("cart", false);
      $(".catalog-sidebar").classList.remove("mobile-open");
      $("[data-mobile-filter-toggle]").setAttribute("aria-expanded", "false");
    }
  });
  $("[data-sort]").addEventListener("change", event => {
    activeSort = event.target.value;
    renderProducts();
  });
  document.addEventListener("change", event => {
    if (!event.target.matches("[data-variant]")) return;
    const card = event.target.closest(".product-card");
    const option = event.target.selectedOptions[0];
    card.querySelector(".price b").textContent = money(Number(option.dataset.price));
    const old = card.querySelector(".price s");
    old.hidden = !option.dataset.oldPrice;
    old.textContent = option.dataset.oldPrice ? money(Number(option.dataset.oldPrice)) : "";
    card.querySelector("[data-card-quantity-value]").textContent = "1";
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
  fetch("/api/catalog").then(response => response.ok ? response.json() : Promise.reject()).then(payload => {
    const freeDeliveryMessage = $("[data-free-delivery-message]");
    const freeDeliveryFrom = Number(payload.settings?.free_delivery_from || 0);
    if (freeDeliveryMessage) {
      freeDeliveryMessage.textContent = freeDeliveryFrom > 0
        ? `Free delivery on orders from ${money(freeDeliveryFrom)}`
        : "Delivery available across Egypt";
    }
    const savedCategories = payload.settings?.catalog_categories;
    if (Array.isArray(savedCategories) && savedCategories.length) {
      data.categories = savedCategories.map(category => {
        const existing = data.categories.find(item => item.id === category.id);
        return {
          id: category.id,
          name: category.label || existing?.name || category.id,
          subtitle: existing?.subtitle || "Explore products in this category",
          icon: existing?.icon || "✦",
          subs: Array.isArray(category.subcategories) ? category.subcategories : []
        };
      });
    }
    if (Array.isArray(payload.products)) data.products = payload.products.map(product => {
      const variants = product.product_variants?.sort((a, b) => a.sort_order - b.sort_order) || [];
      const base = variants.find(variant => variant.is_default) || variants[0] || {};
      return { ...product, image: product.image_url, price: Number(base.price || 0), oldPrice: base.old_price ? Number(base.old_price) : null, badge: product.badge || (product.is_bestseller ? "BESTSELLER" : product.is_offer ? "SALE" : ""), featured: product.is_bestseller, product_variants: variants };
    });
    renderMainFilters(); renderSubFilters(); renderShelves(); renderProducts(); saveCart();
  }).catch(() => {});
})();
