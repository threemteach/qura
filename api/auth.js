import { client, json, bearer } from "./_client.js";

export default async function handler(req, res) {
  try {
    const db = client(bearer(req));
    if (req.method === "POST") {
      const { email, password } = req.body || {};
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) return json(res, 401, { error: error.message });
      if (data.user?.app_metadata?.role !== "admin") return json(res, 403, { error: "This account is not an administrator." });
      return json(res, 200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token, user: { email: data.user.email } });
    }
    if (req.method === "GET") {
      const { data, error } = await db.auth.getUser(bearer(req));
      if (error || data.user?.app_metadata?.role !== "admin") return json(res, 401, { error: "Unauthorized" });
      return json(res, 200, { user: { email: data.user.email } });
    }
    json(res, 405, { error: "Method not allowed" });
  } catch (error) { json(res, 500, { error: error.message }); }
}
