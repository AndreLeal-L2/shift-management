const {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  clearSessionCookie,
  createAdminSessionToken,
  getSessionToken,
  isValidAdminSession,
  readJson,
  sendError,
  setSessionCookie,
} = require("./_security");

module.exports = async (req, res) => {
  applySecurityHeaders(req, res, ["GET", "POST", "DELETE"]);
  if (!assertMethod(req, res, ["GET", "POST", "DELETE"])) return;
  if (!assertSameOrigin(req, res)) return;

  try {
    if (req.method === "GET") {
      const token = getSessionToken(req);
      if (!token || !isValidAdminSession(token)) {
        return res.status(200).json({ authenticated: false });
      }
      return res.status(200).json({
        authenticated: true,
        user: {
          id: "admin",
          email: ADMIN_EMAIL,
        },
      });
    }

    if (req.method === "DELETE") {
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

    setSessionCookie(res, req, createAdminSessionToken(60 * 60 * 8), 60 * 60 * 8);
    return res.status(200).json({
      user: {
        id: "admin",
        email: ADMIN_EMAIL,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};
