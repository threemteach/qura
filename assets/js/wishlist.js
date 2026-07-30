(() => {
  const grid = document.querySelector("[data-wishlist-grid]");
  const money = value => `EGP ${value.toLocaleString("en-EG")}`;
  function render() {
    const current = JSON.parse(localStorage.getItem("curaWishlist") || "[]");
    const list = window.CURA_DATA.products.filter(product => current.some(id => String(id) === String(product.id)));
    grid.innerHTML = list.map(product => `<article class="wishlist-card"><div><img src="${product.image}" alt="${product.name}"><button type="button" data-remove-wish="${product.id}" aria-label="Remove ${product.name}">×</button></div><small>${product.brand}</small><h2>${product.name}</h2><p>${money(product.price)}</p><a class="button button-secondary" href="index.html#products">Choose size & add</a></article>`).join("");
    document.querySelector("[data-wishlist-empty]").hidden = list.length > 0;
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-wish]");
    if (!button) return;
    const current = JSON.parse(localStorage.getItem("curaWishlist") || "[]").filter(id => String(id) !== button.dataset.removeWish);
    localStorage.setItem("curaWishlist", JSON.stringify(current));
    render();
  });
  render();
})();
