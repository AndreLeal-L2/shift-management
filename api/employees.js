const {
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  readJson,
  requireUser,
  sendError,
  validateEmployeePayload,
} = require("./_security");

module.exports = async (req, res) => {
  applySecurityHeaders(req, res, ["GET", "POST", "PUT", "DELETE"]);
  if (!assertMethod(req, res, ["GET", "POST", "PUT", "DELETE"])) return;
  if (!assertSameOrigin(req, res)) return;

  try {
    const session = await requireUser(req, res);
    if (!session) return;

    if (req.method === "GET") {
      const { data, error } = await session.supabase
        .from("employees")
        .select("id,name,role,max_hours,availability,created_at,updated_at")
        .eq("owner_id", session.ownerId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const parsed = validateEmployeePayload(await readJson(req), false);
      if (parsed.error) return res.status(400).json({ error: parsed.error });

      const { data, error } = await session.supabase
        .from("employees")
        .insert([{ ...parsed.value, owner_id: session.ownerId }])
        .select("id,name,role,max_hours,availability,created_at,updated_at")
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const parsed = validateEmployeePayload(await readJson(req), true);
      if (parsed.error) return res.status(400).json({ error: parsed.error });

      const { id, ...updates } = parsed.value;
      const { data, error } = await session.supabase
        .from("employees")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", session.ownerId)
        .select("id,name,role,max_hours,availability,created_at,updated_at")
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    const urlObj = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const id = String(urlObj.searchParams.get("id") || "").trim();
    if (!id) return res.status(400).json({ error: "Missing employee id" });

    const { error } = await session.supabase
      .from("employees")
      .delete()
      .eq("id", id)
      .eq("owner_id", session.ownerId);
    if (error) throw error;
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error);
  }
};
