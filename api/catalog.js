import { client, json } from "./_client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const db = client();
    const [{ data: products, error }, { data: settings, error: settingsError }] = await Promise.all([
      db.from("products").select("*, product_variants(*)").eq("is_active", true).order("sort_order"),
      db.from("store_settings").select("*").eq("id", 1).single()
    ]);
    if (error || settingsError) throw error || settingsError;
    json(res, 200, { products, settings });
  } catch (error) {
    json(res, 503, { error: error.message, fallback: true });
  }
}
