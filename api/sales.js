const {
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  readJson,
  requireUser,
  sendError,
  validateSalesPayload,
} = require("./_security");

const SALES_COLUMNS = "id,recorded_at,sales";

function isMissingOwnerColumn(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes("owner_id") && (
    text.includes("schema cache") ||
    text.includes("column") ||
    text.includes("does not exist") ||
    error?.code === "PGRST204" ||
    error?.code === "42703"
  );
}

async function selectSales(session, scoped = true) {
  let query = session.supabase
    .from("sales_history")
    .select(SALES_COLUMNS)
    .order("recorded_at", { ascending: false })
    .limit(52);

  if (scoped) query = query.eq("owner_id", session.ownerId);
  return query;
}

async function insertSales(session, sales, scoped = true) {
  const payload = {
    ...(scoped ? { owner_id: session.ownerId } : {}),
    recorded_at: new Date().toISOString(),
    sales,
  };

  return session.supabase
    .from("sales_history")
    .insert([payload])
    .select(SALES_COLUMNS)
    .single();
}

module.exports = async (req, res) => {
  applySecurityHeaders(req, res, ["GET", "POST"]);
  if (!assertMethod(req, res, ["GET", "POST"])) return;
  if (!assertSameOrigin(req, res)) return;

  try {
    const session = await requireUser(req, res);
    if (!session) return;

    if (req.method === "GET") {
      let { data, error } = await selectSales(session);
      if (isMissingOwnerColumn(error)) {
        ({ data, error } = await selectSales(session, false));
      }

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    const parsed = validateSalesPayload(await readJson(req));
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    let { data, error } = await insertSales(session, parsed.value);
    if (isMissingOwnerColumn(error)) {
      ({ data, error } = await insertSales(session, parsed.value, false));
    }

    if (error) throw error;
    return res.status(201).json(data);
  } catch (error) {
    return sendError(res, error);
  }
};
