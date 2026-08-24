import express from "express";
import { z } from "zod";
import { ApiError, asyncRoute } from "./errors.js";
import { transaction } from "./db.js";
import { PRIVILEGED_ROLES } from "./permissions.js";
import {
  audit, createSession, currentMfa, decryptSensitive, enforceRateLimit, hashPassword, isoNow, opaqueId,
  permissionsFor, randomToken, requireAuth, revokeSession, sha256, verifyMfa, verifyPassword,
} from "./security.js";
import { parse } from "./validation.js";
import { queuePasswordResetEmail } from "./jobs.js";

const passwordSchema = z.string().min(12).max(128).refine((value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value), "Use upper/lowercase letters and a number");

export function createAuthRouter({ db, config }) {
  const router = express.Router();

  router.get("/csrf", (req, res) => res.json({ csrfToken: res.locals.csrfToken }));
  router.all(["/register", "/verify-email", "/phone-verification/request", "/phone-verification/confirm"], (req, res) => {
    res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Self-service account enrollment is not available" } });
  });

  router.post("/login", asyncRoute(async (req, res) => {
    await enforceRateLimit(db, "login", `${req.ip}:${req.body?.email || "unknown"}`, 8, 15 * 60 * 1000);
    const body = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(128), mfaCode: z.string().max(12).optional() }), req.body);
    const row = await db.prepare(`SELECT u.*, r.name role FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.email = ? LIMIT 1`).get(body.email.toLowerCase());
    if (!row || !(await verifyPassword(body.password, row.password_hash))) throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    if (row.disabled_at) throw new ApiError(403, "ACCOUNT_DISABLED", "This account is disabled");
    if (!row.email_verified_at) throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before signing in");
    if (PRIVILEGED_ROLES.includes(row.role)) {
      if (!row.mfa_enabled || !row.mfa_secret_encrypted) throw new ApiError(403, "MFA_SETUP_REQUIRED", "Privileged access is blocked until MFA is configured");
      const secret = decryptSensitive(row.mfa_secret_encrypted, config.dataEncryptionKey);
      if (!body.mfaCode) throw new ApiError(403, "MFA_REQUIRED", "Enter your multi-factor authentication code", config.exposeDevHelpers ? { developmentCode: await currentMfa(secret) } : undefined);
      if (!(await verifyMfa(body.mfaCode, secret))) throw new ApiError(401, "MFA_INVALID", "The multi-factor authentication code is invalid");
    }
    const sessionId = await createSession(db, req, res, row, row.role, config, req.get("x-csrf-token"));
    await audit(db, req, "SESSION_CREATED", "SESSION", sessionId, null, { userId: row.id, role: row.role, sessionId });
    res.json({ user: { id: row.id, email: row.email, role: row.role, permissions: await permissionsFor(db, row.role) } });
  }));

  router.get("/me", asyncRoute(async (req, res) => {
    if (!req.auth) return res.json({ user: null });
    res.json({ user: { id: req.auth.userId, email: req.auth.email, phone: req.auth.phone, role: req.auth.role, permissions: await permissionsFor(db, req.auth.role) } });
  }));

  router.post("/logout", requireAuth, asyncRoute(async (req, res) => {
    await audit(db, req, "SESSION_REVOKED", "SESSION", req.auth.sessionId);
    await revokeSession(db, req.auth.sessionId);
    res.clearCookie(config.sessionCookie, { path: "/" });
    res.status(204).end();
  }));

  router.get("/sessions", requireAuth, asyncRoute(async (req, res) => {
    const sessions = await db.prepare("SELECT id, created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC").all(req.auth.userId);
    res.json({ sessions });
  }));

  router.delete("/sessions/:id", requireAuth, asyncRoute(async (req, res) => {
    const session = await db.prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?").get(req.params.id, req.auth.userId);
    if (!session) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Session not found");
    await revokeSession(db, session.id);
    await audit(db, req, "SESSION_REVOKED", "SESSION", session.id);
    res.status(204).end();
  }));

  router.post("/password-reset/request", asyncRoute(async (req, res) => {
    await enforceRateLimit(db, "password_reset", `${req.ip}:${req.body?.email || "unknown"}`, 5, 60 * 60 * 1000);
    const { email } = parse(z.object({ email: z.string().email() }), req.body);
    const user = await db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    let developmentResetToken;
    if (user) {
      const token = randomToken();
      developmentResetToken = config.exposeDevHelpers ? token : undefined;
      await transaction(db, async (tx) => {
        const now = isoNow();
        await tx.prepare("UPDATE verification_tokens SET consumed_at = ? WHERE user_id = ? AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL").run(now, user.id);
        await tx.prepare("INSERT INTO verification_tokens(id, user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, 'PASSWORD_RESET', ?, ?, ?)")
          .run(opaqueId(), user.id, sha256(token), new Date(Date.now() + 30 * 60 * 1000).toISOString(), now);
        await queuePasswordResetEmail(tx, { userId: user.id, token }, config);
      });
    }
    res.json({ accepted: true, ...(developmentResetToken ? { developmentResetToken } : {}) });
  }));

  router.post("/password-reset/confirm", asyncRoute(async (req, res) => {
    const body = parse(z.object({ token: z.string().min(20), password: passwordSchema }), req.body);
    await transaction(db, async (tx) => {
      const lock = tx.dialect === "postgres" ? " FOR UPDATE" : "";
      const token = await tx.prepare(`SELECT * FROM verification_tokens WHERE token_hash = ? AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL${lock}`).get(sha256(body.token));
      if (!token || new Date(token.expires_at) <= new Date()) throw new ApiError(400, "TOKEN_INVALID", "The reset token is invalid or expired");
      const now = isoNow();
      await tx.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(await hashPassword(body.password), now, token.user_id);
      await tx.prepare("UPDATE verification_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").run(now, token.id);
      await tx.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now, token.user_id);
      const role = (await tx.prepare("SELECT role_id role FROM user_roles WHERE user_id = ? LIMIT 1").get(token.user_id))?.role || "ADMIN";
      await audit(tx, req, "PASSWORD_RESET", "USER", token.user_id, null, { userId: token.user_id, role });
    });
    res.json({ reset: true });
  }));

  return router;
}
