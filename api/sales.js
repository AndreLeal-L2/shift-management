const {
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  readJson,
  requireUser,
  sendError,
  validateSalesPayload,
} = require("./_security");

module.exports = async (req, res) => {
  applySecurityHeaders(req, res, ["GET", "POST"]);
  if (!assertMethod(req, res, ["GET", "POST"])) return;
  if (!assertSameOrigin(req, res)) return;

  const session = await requireUser(req, res);
  if (!session) return;

  try {
    if (req.method === "GET") {
      const { data, error } = await session.supabase
        .from("sales_history")
        .select("id,recorded_at,sales,created_at")
        .order("recorded_at", { ascending: false })
        .limit(52);

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    const parsed = validateSalesPayload(await readJson(req));
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { data, error } = await session.supabase
      .from("sales_history")
      .insert([{ recorded_at: new Date().toISOString(), sales: parsed.value }])
      .select("id,recorded_at,sales,created_at")
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    return sendError(res, error);
  }
};
