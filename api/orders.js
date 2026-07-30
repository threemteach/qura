import { client, json } from "./_client.js";

export default async function handler(req, res) {
  try {
    const db = client();
    if (req.method === "POST") {
      const { customer, items, payment_method, payment_proof_path } = req.body || {};
      const { data, error } = await db.rpc("place_order", { p_customer: customer, p_items: items, p_payment_method: payment_method, p_payment_proof_path: payment_proof_path });
      if (error) throw error;
      return json(res, 201, { order: data });
    }
    if (req.method === "GET") {
      const query = req.query.query || req.query.order || req.query.phone;
      const { data, error } = await db.rpc("track_orders", { p_query: query, p_tracking_token: req.query.token || null });
      if (error) throw error;
      return data?.length ? json(res, 200, { orders: data }) : json(res, 404, { error: "Order not found" });
    }
    json(res, 405, { error: "Method not allowed" });
  } catch (error) { json(res, 400, { error: error.message }); }
}
