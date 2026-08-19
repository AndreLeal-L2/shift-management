const { createClient } = require("@supabase/supabase-js");

const SESSION_COOKIE = "__Host-relleno_session";
const LOCAL_ADMIN_EMAIL = "admin@relleno.pt";
const LOCAL_ADMIN_TOKEN = "relleno-local-admin-session";
const MAX_JSON_BYTES = 25 * 1024;
const weekDayKeys = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

function getSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return { supabaseUrl, supabaseKey };
}

function createSupabaseClient(token) {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

function applySecurityHeaders(req, res, methods) {
  res.setHeader("Access-Control-Allow-Methods", `${methods.join(", ")}, OPTIONS`);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
      }
    } catch (_) {}
  }
}

function assertMethod(req, res, allowed) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }

  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }

  return true;
}

function assertSameOrigin(req, res) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;

  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    if (new URL(origin).host === req.headers.host) return true;
  } catch (_) {}

  res.status(403).json({ error: "Forbidden" });
  return false;
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getSessionToken(req) {
  return parseCookies(req)[SESSION_COOKIE] || "";
}

function sessionCookie(value, req, maxAge) {
  const secure = !/^localhost(?::\d+)?$/.test(req.headers.host || "");
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function setSessionCookie(res, req, token, expiresInSeconds) {
  const maxAge = Math.max(60, Math.min(Number(expiresInSeconds || 3600), 60 * 60 * 8));
  res.setHeader("Set-Cookie", sessionCookie(token, req, maxAge));
}

function clearSessionCookie(res, req) {
  res.setHeader("Set-Cookie", sessionCookie("", req, 0));
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      const err = new Error("Payload too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function requireUser(req, res) {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (token === LOCAL_ADMIN_TOKEN) {
    return {
      user: { id: "local-admin", email: LOCAL_ADMIN_EMAIL },
      token,
      supabase: createSupabaseClient(),
    };
  }

  const supabase = createSupabaseClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    clearSessionCookie(res, req);
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return { user: data.user, token, supabase };
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function sanitizeRole(input) {
  return String(input || "")
    .split(",")
    .map((role) => cleanText(role, 40))
    .filter(Boolean)
    .slice(0, 8)
    .join(", ");
}

function sanitizeAvailability(input) {
  const source = input && typeof input === "object" ? input : {};
  const result = {};

  weekDayKeys.forEach((day) => {
    const value = source[day];
    const shifts = Array.isArray(value)
      ? value
      : Array.isArray(value && value.shifts)
        ? value.shifts
        : [];

    const cleanShifts = shifts.filter((shift) => shift === "day" || shift === "night");
    const custom = Boolean(value && typeof value === "object" && value.custom);
    const start = isValidTime(value && value.start) ? value.start : "09:00";
    const end = isValidTime(value && value.end) ? value.end : "17:00";
    const rawIntervals = Array.isArray(value && value.intervals) ? value.intervals : [];
    const intervals = rawIntervals
      .map((interval) => ({
        start: isValidTime(interval && interval.start) ? interval.start : "",
        end: isValidTime(interval && interval.end) ? interval.end : "",
      }))
      .filter((interval) => interval.start && interval.end)
      .slice(0, 6);

    result[day] = { shifts: cleanShifts, custom, start, end, intervals: custom ? intervals : [] };
  });

  return result;
}

function validateEmployeePayload(body, requireId) {
  const id = cleanText(body.id, 80);
  const name = cleanText(body.name, 80);
  const role = sanitizeRole(body.role);
  const hours = Number(body.maxHours !== undefined ? body.maxHours : body.max_hours);

  if (requireId && !id) return { error: "Missing employee id" };
  if (name.length < 2) return { error: "Name is required" };
  if (role.length < 2 || role.length > 160) return { error: "Role is required" };
  if (!Number.isFinite(hours) || hours < 1 || hours > 60) return { error: "Invalid weekly hours" };

  return {
    value: {
      id,
      name,
      role,
      max_hours: Math.round(hours),
      availability: sanitizeAvailability(body.availability),
    },
  };
}

function validateSalesPayload(body) {
  const sales = body && body.sales && typeof body.sales === "object" ? body.sales : null;
  if (!sales) return { error: "Sales data is required" };

  const value = {};
  for (const day of weekDayKeys) {
    const amount = Number(sales[day]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
      return { error: "Invalid sales value" };
    }
    value[day] = Math.round(amount);
  }

  return { value };
}

function sendError(res, error) {
  const status = error && error.statusCode ? error.statusCode : 500;
  res.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
}

module.exports = {
  applySecurityHeaders,
  assertMethod,
  assertSameOrigin,
  clearSessionCookie,
  createSupabaseClient,
  LOCAL_ADMIN_EMAIL,
  LOCAL_ADMIN_TOKEN,
  readJson,
  requireUser,
  sendError,
  setSessionCookie,
  getSessionToken,
  validateEmployeePayload,
  validateSalesPayload,
};
