import { randomUUID } from "node:crypto";
import { transaction } from "./db.js";
import { decryptSensitive, encryptSensitive, isoNow, opaqueId, sha256 } from "./security.js";

export async function enqueueJob(db, jobType, payload, idempotencyKey, runAt = isoNow()) {
  await db.prepare(`INSERT INTO background_jobs(id, job_type, payload, status, run_at, idempotency_key, created_at)
    VALUES (?, ?, ?, 'PENDING', ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`)
    .run(opaqueId(), jobType, JSON.stringify(payload), runAt, idempotencyKey, isoNow());
}

export async function queueNotification(db, { userId, caseId, eventType, channel = "EMAIL", payload = {}, idempotencyKey }) {
  await db.prepare(`INSERT INTO notifications(id, user_id, case_id, channel, event_type, payload_minimal, status, idempotency_key, scheduled_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`)
    .run(opaqueId(), userId || null, caseId || null, channel, eventType, JSON.stringify(payload), idempotencyKey, isoNow());
  await enqueueJob(db, "NOTIFICATION_DELIVERY", { idempotencyKey }, `notification:${idempotencyKey}`);
}

export async function queuePasswordResetEmail(db, { userId, token }, config) {
  await enqueueJob(db, "PASSWORD_RESET_EMAIL", {
    userId,
    tokenEncrypted: encryptSensitive(token, config.dataEncryptionKey),
  }, `password-reset:${sha256(token)}`);
}

async function claimOneJob(db, workerId) {
  return transaction(db, async (tx) => {
    const lock = tx.dialect === "postgres" ? " FOR UPDATE SKIP LOCKED" : "";
    const job = await tx.prepare(`SELECT * FROM background_jobs WHERE status = 'PENDING' AND run_at <= ? ORDER BY run_at LIMIT 1${lock}`).get(isoNow());
    if (!job) return null;
    const result = await tx.prepare("UPDATE background_jobs SET status = 'RUNNING', locked_at = ?, locked_by = ?, attempts = attempts + 1 WHERE id = ? AND status = 'PENDING'")
      .run(isoNow(), workerId, job.id);
    if (!result.changes) return null;
    return { ...job, attempts: Number(job.attempts) + 1 };
  });
}

export async function runOneJob(db, handlers = {}, { config, workerId = randomUUID() } = {}) {
  const job = await claimOneJob(db, workerId);
  if (!job) return null;
  try {
    const handler = handlers[job.job_type] || defaultHandler;
    await handler(db, JSON.parse(job.payload), job, config);
    await db.prepare("UPDATE background_jobs SET status = 'COMPLETED', completed_at = ?, locked_at = NULL, locked_by = NULL WHERE id = ?").run(isoNow(), job.id);
    return { id: job.id, status: "COMPLETED" };
  } catch (error) {
    const terminal = job.attempts >= Number(job.max_attempts);
    const retryAt = new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** job.attempts * 5_000)).toISOString();
    await db.prepare("UPDATE background_jobs SET status = ?, run_at = ?, last_error_code = ?, locked_at = NULL, locked_by = NULL WHERE id = ?")
      .run(terminal ? "FAILED" : "PENDING", retryAt, error.code || "JOB_FAILED", job.id);
    return { id: job.id, status: terminal ? "FAILED" : "PENDING" };
  }
}

async function defaultHandler(db, payload, job, config) {
  if (job.job_type === "NOTIFICATION_DELIVERY") return deliverNotification(db, payload.idempotencyKey, config);
  if (job.job_type === "PASSWORD_RESET_EMAIL") return deliverPasswordResetEmail(db, payload, job.idempotency_key, config);
  if (["STALE_CASE_CHECK", "FOUND_CASE_PRIVACY_REVIEW_REMINDER", "TEMP_UPLOAD_CLEANUP", "EXPIRED_PRIVATE_FILE_CLEANUP", "RETENTION_PROCESSING"].includes(job.job_type)) return;
  throw Object.assign(new Error("Unknown job type"), { code: "UNKNOWN_JOB_TYPE" });
}

async function sendEmail({ to, subject, text, idempotencyKey }, config) {
  if (config?.emailProvider === "development") return { development: true };
  if (config?.emailProvider !== "resend" || !config.resendApiKey) throw Object.assign(new Error("Email provider unavailable"), { code: "EMAIL_PROVIDER_UNAVAILABLE" });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: config.emailFrom, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw Object.assign(new Error("Email delivery failed"), { code: `EMAIL_${response.status}` });
  return { development: false };
}

async function deliverPasswordResetEmail(db, payload, idempotencyKey, config) {
  const user = await db.prepare("SELECT email FROM users WHERE id = ? AND disabled_at IS NULL").get(payload.userId);
  if (!user) return;
  const token = decryptSensitive(payload.tokenEncrypted, config.dataEncryptionKey);
  const verification = await db.prepare("SELECT expires_at FROM verification_tokens WHERE user_id = ? AND token_hash = ? AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL").get(payload.userId, sha256(token));
  if (!verification || new Date(verification.expires_at) <= new Date()) return;
  const resetUrl = `${config.publicBaseUrl.replace(/\/$/, "")}/#/moderator?reset=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Find Georgia staff password",
    text: `A password reset was requested for your Find Georgia staff account. Use this single-use link within 30 minutes: ${resetUrl}\n\nIf you did not request this, contact the system administrator.`,
    idempotencyKey,
  }, config);
}

async function deliverNotification(db, idempotencyKey, config) {
  const notification = await db.prepare(`SELECT n.*, u.email user_email FROM notifications n LEFT JOIN users u ON u.id = n.user_id
    WHERE n.idempotency_key = ? AND n.status = 'PENDING'`).get(idempotencyKey);
  if (!notification) return;
  if (config?.emailProvider === "development") {
    await db.prepare("UPDATE notifications SET status = 'SENT_DEMO', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(isoNow(), notification.id);
    return;
  }
  if (config?.emailProvider !== "resend" || !config.resendApiKey) throw Object.assign(new Error("Email provider unavailable"), { code: "EMAIL_PROVIDER_UNAVAILABLE" });
  const recipient = notification.user_email || config.adminNotificationEmail;
  if (!recipient) throw Object.assign(new Error("Notification recipient missing"), { code: "EMAIL_RECIPIENT_MISSING" });
  await sendEmail({
    to: recipient,
    subject: "Find Georgia staff notification",
    text: `A ${notification.event_type} event requires staff attention. No sensitive case details are included in this email.`,
    idempotencyKey,
  }, config);
  await db.prepare("UPDATE notifications SET status = 'SENT', sent_at = ?, attempts = attempts + 1 WHERE id = ?").run(isoNow(), notification.id);
}

export function startJobLoop(db, config, intervalMs = 5000) {
  const workerId = randomUUID();
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await runOneJob(db, {}, { config, workerId }); }
    catch (error) { console.error(JSON.stringify({ level: "error", event: "job_loop_error", code: error.code, message: error.message })); }
    finally { running = false; }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return () => clearInterval(timer);
}
