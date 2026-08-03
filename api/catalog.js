import { client, json } from "./_client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const db = client();
    const [{ data: products, error }, { data: settings, error: settingsError }, { data: bundleItems, error: bundleError }] = await Promise.all([
      db.from("products").select("*, product_variants(*)").eq("is_active", true).order("sort_order"),
      db.from("store_settings").select("*").eq("id", 1).single(),
      db.from("product_bundle_items").select("*, component_variant:product_variants(id,label,stock,product_id)").order("sort_order")
    ]);
    if (error || settingsError) throw error || settingsError;
    const safeBundleItems = (bundleError ? [] : (bundleItems || [])).map(item => {
      const componentProduct = products.find(product => product.id === item.component_variant?.product_id);
      return { ...item, component_product: componentProduct ? { name: componentProduct.name, image_url: componentProduct.image_url } : null };
    });
    const hydrated = products.map(product => {
      const items = safeBundleItems.filter(item => item.bundle_product_id === product.id);
      if (product.badge !== "PACKAGE" || !items.length) return { ...product, bundle_items: items };
      const componentAvailability = Math.min(...items.map(item => Math.floor(Number(item.component_variant?.stock || 0) / Number(item.quantity || 1))));
      return { ...product, bundle_items: items, product_variants: (product.product_variants || []).map(variant => ({ ...variant, stock: Math.min(Number(variant.stock || 0), componentAvailability) })) };
    });
    json(res, 200, { products: hydrated, settings });
  } catch (error) {
    json(res, 503, { error: error.message, fallback: true });
  }
}
