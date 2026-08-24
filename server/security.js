import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { generate, verify } from "otplib";
import { ApiError } from "./errors.js";
import { PRIVILEGED_ROLES } from "./permissions.js";
import { transaction } from "./db.js";

export const isoNow = () => new Date().toISOString();
export const opaqueId = () => randomUUID();
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function keyFromSecret(secret) { return createHash("sha256").update(secret).digest(); }

export function encryptSensitive(value, secret) {
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptSensitive(value, secret) {
  if (!value) return null;
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1") throw new ApiError(500, "ENCRYPTION_ERROR", "Sensitive value could not be read");
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export async function hashPassword(password) { return bcrypt.hash(password, 12); }
export async function verifyPassword(password, hash) { return bcrypt.compare(password, hash); }

export async function verifyMfa(code, secret) {
  if (!code || !secret) return false;
  return (await verify({ secret, token: String(code).replace(/\s/g, "") })).valid;
}

export async function currentMfa(secret) { return generate({ secret }); }

export function requestContext(req) {
  const rawIp = req.ip || req.socket?.remoteAddress || "unknown";
  const ipPrefix = sha256(rawIp).slice(0, 16);
  return { requestId: req.requestId, sessionId: req.auth?.sessionId || null, ipPrefix };
}

export async function audit(db, req, action, resourceType, resourceId, reason, actor = req.auth) {
  const context = requestContext(req);
  await db.prepare(`INSERT INTO audit_events(id, actor_id, actor_role, action, resource_type, resource_id, reason, session_id, request_id, ip_prefix, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(opaqueId(), actor?.userId || null, actor?.role || null, action, resourceType, resourceId, reason || null, context.sessionId, context.requestId, context.ipPrefix, isoNow());
}

export async function logSensitiveAccess(db, req, resourceType, resourceId, action) {
  if (!req.auth) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Authentication required");
  await db.prepare("INSERT INTO sensitive_access_logs(id, actor_id, resource_type, resource_id, action, request_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(opaqueId(), req.auth.userId, resourceType, resourceId, action, req.requestId, isoNow());
}

export async function createSession(db, req, res, user, role, config, csrfToken) {
  const token = randomToken();
  const now = Date.now();
  const expiresAt = new Date(now + config.sessionTtlSeconds * 1000).toISOString();
  const sessionId = opaqueId();
  await db.prepare(`INSERT INTO sessions(id, user_id, token_hash, csrf_hash, mfa_verified_at, created_at, last_seen_at, expires_at, user_agent_hash, ip_prefix)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, user.id, sha256(token), sha256(csrfToken), PRIVILEGED_ROLES.includes(role) ? isoNow() : null, isoNow(), isoNow(), expiresAt, sha256(req.get("user-agent") || "unknown"), requestContext(req).ipPrefix);
  res.cookie(config.sessionCookie, token, { httpOnly: true, secure: config.env === "production", sameSite: "strict", maxAge: config.sessionTtlSeconds * 1000, path: "/" });
  return sessionId;
}

export async function revokeSession(db, sessionId) {
  await db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(isoNow(), sessionId);
}

export function sessionMiddleware(db, config) {
  return async (req, res, next) => {
    try {
    const token = req.cookies?.[config.sessionCookie];
    if (!token) return next();
    const row = await db.prepare(`SELECT s.id session_id, s.user_id, s.csrf_hash, s.mfa_verified_at, s.expires_at, s.revoked_at,
      u.email, u.phone, u.disabled_at, u.email_verified_at, r.name role
      FROM sessions s JOIN users u ON u.id = s.user_id
      JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
      WHERE s.token_hash = ? LIMIT 1`).get(sha256(token));
    if (!row || row.revoked_at || row.disabled_at || new Date(row.expires_at) <= new Date()) {
      if (row && !row.revoked_at) await revokeSession(db, row.session_id);
      res.clearCookie(config.sessionCookie, { path: "/" });
      return next();
    }
    req.auth = { userId: row.user_id, email: row.email, phone: row.phone, role: row.role, sessionId: row.session_id, csrfHash: row.csrf_hash, mfaVerifiedAt: row.mfa_verified_at };
    await db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(isoNow(), row.session_id);
    next();
    } catch (error) { next(error); }
  };
}

export function csrfMiddleware(config) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const cookie = req.cookies?.[config.csrfCookie];
    const header = req.get("x-csrf-token");
    if (!cookie || !header || cookie.length !== header.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
      return next(new ApiError(403, "CSRF_REJECTED", "The security token is missing or expired"));
    }
    if (req.auth && sha256(header) !== req.auth.csrfHash) return next(new ApiError(403, "CSRF_REJECTED", "The security token does not match the session"));
    const origin = req.get("origin");
    if (origin && origin !== config.appOrigin) return next(new ApiError(403, "CSRF_REJECTED", "Request origin is not allowed"));
    next();
  };
}

export function issueCsrf(req, res, config) {
  const existing = req.cookies?.[config.csrfCookie];
  const token = existing && existing.length >= 32 ? existing : randomToken(24);
  res.cookie(config.csrfCookie, token, { httpOnly: false, secure: config.env === "production", sameSite: "strict", path: "/" });
  return token;
}

export function requireAuth(req, res, next) {
  if (!req.auth) return next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue"));
  next();
}

export async function permissionsFor(db, role) {
  return (await db.prepare(`SELECT p.name FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN roles r ON r.id = rp.role_id WHERE r.name = ?`).all(role)).map((row) => row.name);
}

export function requirePermission(db, permission) {
  return async (req, res, next) => {
    try {
    if (!req.auth) return next(new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue"));
    if (!(await permissionsFor(db, req.auth.role)).includes(permission)) return next(new ApiError(403, "FORBIDDEN", "You do not have permission for this action"));
    if (PRIVILEGED_ROLES.includes(req.auth.role) && !req.auth.mfaVerifiedAt) return next(new ApiError(403, "MFA_REQUIRED", "Multi-factor authentication is required"));
    next();
    } catch (error) { next(error); }
  };
}

export async function enforceRateLimit(db, bucket, identity, limit, windowMs) {
  const cutoff = Date.now() - windowMs;
  const bucketKey = `${bucket}:${sha256(identity).slice(0, 24)}`;
  return transaction(db, async (tx) => {
    if (tx.dialect === "postgres") await tx.prepare("SELECT pg_advisory_xact_lock(hashtext(?))").get(bucketKey);
    await tx.prepare("DELETE FROM rate_limit_events WHERE bucket_key = ? AND occurred_at < ?").run(bucketKey, cutoff);
    const count = (await tx.prepare("SELECT COUNT(*) count FROM rate_limit_events WHERE bucket_key = ? AND occurred_at >= ?").get(bucketKey, cutoff)).count;
    if (count >= limit) throw new ApiError(429, "RATE_LIMITED", "Too many attempts. Please wait and try again.", { retryAfterSeconds: Math.ceil(windowMs / 1000) });
    await tx.prepare("INSERT INTO rate_limit_events(id, bucket_key, occurred_at) VALUES (?, ?, ?)").run(opaqueId(), bucketKey, Date.now());
  });
}

export async function verifyBot(req, config) {
  if (config.botProvider === "development") {
    if (req.get("x-bot-token") !== config.botDevToken) throw new ApiError(400, "BOT_CHECK_REQUIRED", "Please complete the anti-bot check and try again");
    return true;
  }
  if (config.botProvider !== "turnstile") throw new ApiError(503, "BOT_PROVIDER_UNAVAILABLE", "The anti-bot check is temporarily unavailable");
  const token = req.get("x-bot-token") || req.body?.turnstileToken;
  if (!token) throw new ApiError(400, "BOT_CHECK_REQUIRED", "Please complete the anti-bot check and try again");
  let response;
  try {
    response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: config.turnstileSecretKey, response: token, remoteip: req.ip || "", idempotency_key: opaqueId() }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new ApiError(503, "BOT_PROVIDER_UNAVAILABLE", "The anti-bot check is temporarily unavailable");
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success || result.hostname !== config.turnstileHostname || result.action !== config.turnstileAction) {
    throw new ApiError(400, "BOT_CHECK_REQUIRED", "Please complete the anti-bot check and try again");
  }
  return true;
}

export function signValue(value, expiresAt, secret) {
  return createHmac("sha256", secret).update(`${value}.${expiresAt}`).digest("base64url");
}
