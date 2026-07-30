import { client, json, bearer } from "./_client.js";

async function requireAdmin(req) {
  const token = bearer(req);
  const db = client(token);
  const { data, error } = await db.auth.getUser(token);
  if (error || data.user?.app_metadata?.role !== "admin") throw new Error("Unauthorized");
  return db;
}

export default async function handler(req, res) {
  try {
    const db = await requireAdmin(req);
    const action = req.query.action || req.body?.action;
    if (req.method === "GET" && action === "dashboard") {
      const [products, orders, settings] = await Promise.all([
        db.from("products").select("*, product_variants(*)").order("sort_order"),
        db.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(100),
        db.from("store_settings").select("*").eq("id", 1).single()
      ]);
      const error = products.error || orders.error || settings.error;
      if (error) throw error;
      return json(res, 200, { products: products.data, orders: orders.data, settings: settings.data });
    }
    if (req.method === "POST" && action === "product") {
      const { variants = [], ...product } = req.body.product;
      const { data, error } = await db.from("products").insert(product).select().single();
      if (error) throw error;
      if (variants.length) {
        const { error: variantError } = await db.from("product_variants").insert(variants.map((variant, index) => ({ ...variant, product_id: data.id, sort_order: index })));
        if (variantError) throw variantError;
      }
      return json(res, 201, { product: data });
    }
    if (req.method === "PATCH" && action === "product") {
      const { id, variants = [], ...product } = req.body.product;
      const { error } = await db.from("products").update(product).eq("id", id);
      if (error) throw error;
      await db.from("product_variants").delete().eq("product_id", id);
      if (variants.length) {
        const { error: variantError } = await db.from("product_variants").insert(variants.map((variant, index) => ({ ...variant, id: undefined, product_id: id, sort_order: index })));
        if (variantError) throw variantError;
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === "DELETE" && action === "product") {
      const { error } = await db.from("products").delete().eq("id", req.query.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    if (req.method === "PATCH" && action === "order") {
      const { error } = await db.from("orders").update({ status: req.body.status, updated_at: new Date().toISOString() }).eq("id", req.body.id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    if (req.method === "PATCH" && action === "settings") {
      const { error } = await db.from("store_settings").update({ ...req.body.settings, updated_at: new Date().toISOString() }).eq("id", 1);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }
    json(res, 400, { error: "Unknown action" });
  } catch (error) { json(res, error.message === "Unauthorized" ? 401 : 500, { error: error.message }); }
}
