import { client, json } from "./_client.js";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  try {
    const { dataUrl } = req.body || {};
    const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(dataUrl || "");
    if (!match) return json(res, 400, { error: "Invalid image" });
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 4 * 1024 * 1024) return json(res, 413, { error: "Image is too large" });
    const ext = match[1] === "image/png" ? "png" : "jpg";
    const path = `incoming/${crypto.randomUUID()}.${ext}`;
    const { error } = await client().storage.from("payment-proofs").upload(path, bytes, { contentType: match[1], upsert: false });
    if (error) throw error;
    json(res, 201, { path });
  } catch (error) { json(res, 400, { error: error.message }); }
}
