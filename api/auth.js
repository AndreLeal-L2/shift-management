const {
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  clearSessionCookie,
  getSessionToken,
  LOCAL_ADMIN_EMAIL,
  LOCAL_ADMIN_TOKEN,
  readJson,
  requireUser,
  sendError,
  setSessionCookie,
} = require("./_security");

const ADMIN_EMAIL = LOCAL_ADMIN_EMAIL;
const ADMIN_PASSWORD = "admin123";

module.exports = async (req, res) => {
  applySecurityHeaders(req, res, ["GET", "POST", "DELETE"]);
  if (!assertMethod(req, res, ["GET", "POST", "DELETE"])) return;
  if (!assertSameOrigin(req, res)) return;

  try {
    if (req.method === "GET") {
      const token = getSessionToken(req);
      if (!token) {
        return res.status(200).json({ authenticated: false });
      }
      if (token === LOCAL_ADMIN_TOKEN) {
        return res.status(200).json({
          authenticated: true,
          user: {
            id: "local-admin",
            email: ADMIN_EMAIL,
          },
        });
      }
      const session = await requireUser(req, res);
      if (!session) return;
      return res.status(200).json({
        authenticated: true,
        user: {
          id: session.user.id,
          email: session.user.email,
        },
      });
    }

    if (req.method === "DELETE") {
      if (getSessionToken(req) === LOCAL_ADMIN_TOKEN) {
        clearSessionCookie(res, req);
        return res.status(204).end();
      }
      const session = await requireUser(req, res);
      if (session) {
        await session.supabase.auth.signOut();
      }
      clearSessionCookie(res, req);
      return res.status(204).end();
    }

    const { email, password } = await readJson(req);
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword || cleanEmail.length > 254 || cleanPassword.length > 256) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (cleanEmail !== ADMIN_EMAIL || cleanPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    setSessionCookie(res, req, LOCAL_ADMIN_TOKEN, 60 * 60 * 8);
    return res.status(200).json({
      user: {
        id: "local-admin",
        email: ADMIN_EMAIL,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};
