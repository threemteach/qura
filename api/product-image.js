import { client, json, bearer } from "./_client.js";

export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const token = bearer(req);
    const db = client(token);
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || auth.user?.app_metadata?.role !== "admin") return json(res, 401, { error: "Unauthorized" });
    const { dataUrl } = req.body || {};
    const match = /^data:(image\/(?:webp|png|jpeg));base64,(.+)$/.exec(dataUrl || "");
    if (!match) return json(res, 400, { error: "Invalid image" });
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 2 * 1024 * 1024) return json(res, 413, { error: "Compressed image is too large" });
    const ext = match[1] === "image/webp" ? "webp" : match[1] === "image/png" ? "png" : "jpg";
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("product-images").upload(path, bytes, { contentType: match[1], cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const { data } = db.storage.from("product-images").getPublicUrl(path);
    json(res, 201, { url: data.publicUrl });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
}
