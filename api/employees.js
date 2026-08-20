const {
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  readJson,
  requireUser,
  sendError,
  validateEmployeePayload,
} = require("./_security");

const EMPLOYEE_COLUMNS = "id,name,role,max_hours,availability";

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

function isMissingColumn(error, column) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase();
  return text.includes(column.toLowerCase()) && (
    text.includes("schema cache") ||
    text.includes("column") ||
    text.includes("does not exist") ||
    error?.code === "PGRST204" ||
    error?.code === "42703"
  );
}

async function selectEmployees(session, scoped = true) {
  let query = session.supabase
    .from("employees")
    .select(EMPLOYEE_COLUMNS)
    .order("name", { ascending: true });

  if (scoped) query = query.eq("owner_id", session.ownerId);
  return query;
}

async function insertEmployee(session, value, scoped = true) {
  const payload = scoped ? { ...value, owner_id: session.ownerId } : value;
  return session.supabase
    .from("employees")
    .insert([payload])
    .select(EMPLOYEE_COLUMNS)
    .single();
}

async function updateEmployee(session, id, updates, scoped = true, touchUpdatedAt = true) {
  const payload = touchUpdatedAt
    ? { ...updates, updated_at: new Date().toISOString() }
    : updates;

  let query = session.supabase
    .from("employees")
    .update(payload)
    .eq("id", id);

  if (scoped) query = query.eq("owner_id", session.ownerId);
  return query.select(EMPLOYEE_COLUMNS).single();
}

async function deleteEmployee(session, id, scoped = true) {
  let query = session.supabase
    .from("employees")
    .delete()
    .eq("id", id);

  if (scoped) query = query.eq("owner_id", session.ownerId);
  return query;
}

module.exports = async (req, res) => {
  applySecurityHeaders(req, res, ["GET", "POST", "PUT", "DELETE"]);
  if (!assertMethod(req, res, ["GET", "POST", "PUT", "DELETE"])) return;
  if (!assertSameOrigin(req, res)) return;

  try {
    const session = await requireUser(req, res);
    if (!session) return;

    if (req.method === "GET") {
      let { data, error } = await selectEmployees(session);
      if (isMissingOwnerColumn(error)) {
        ({ data, error } = await selectEmployees(session, false));
      }

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === "POST") {
      const parsed = validateEmployeePayload(await readJson(req), false);
      if (parsed.error) return res.status(400).json({ error: parsed.error });

      let { data, error } = await insertEmployee(session, parsed.value);
      if (isMissingOwnerColumn(error)) {
        ({ data, error } = await insertEmployee(session, parsed.value, false));
      }

      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === "PUT") {
      const parsed = validateEmployeePayload(await readJson(req), true);
      if (parsed.error) return res.status(400).json({ error: parsed.error });

      const { id, ...updates } = parsed.value;
      let { data, error } = await updateEmployee(session, id, updates);
      if (isMissingColumn(error, "updated_at")) {
        ({ data, error } = await updateEmployee(session, id, updates, true, false));
      }
      if (isMissingOwnerColumn(error)) {
        ({ data, error } = await updateEmployee(session, id, updates, false));
        if (isMissingColumn(error, "updated_at")) {
          ({ data, error } = await updateEmployee(session, id, updates, false, false));
        }
      }

      if (error) throw error;
      return res.status(200).json(data);
    }

    const urlObj = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const id = String(urlObj.searchParams.get("id") || "").trim();
    if (!id) return res.status(400).json({ error: "Missing employee id" });

    let { error } = await deleteEmployee(session, id);
    if (isMissingOwnerColumn(error)) {
      ({ error } = await deleteEmployee(session, id, false));
    }

    if (error) throw error;
    return res.status(204).end();
  } catch (error) {
    return sendError(res, error);
  }
};
