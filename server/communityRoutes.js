import express from "express";
import multer from "multer";
import { z } from "zod";
import { nextCounter, transaction } from "./db.js";
import { ApiError, asyncRoute } from "./errors.js";
import { getCase, getTip, listTips } from "./repository.js";
import { detectRiskSignals, informationQuality } from "./risk.js";
import { tipDTO } from "./serializers.js";
import {
  audit, enforceRateLimit, encryptSensitive, isoNow, logSensitiveAccess, opaqueId, permissionsFor,
  requireAuth, requirePermission, verifyBot,
} from "./security.js";
import { inspectUpload, persistObject, privateDownloadUrl, readPrivateObject, signedDownloadToken, verifySignedDownload } from "./storage.js";
import { parse } from "./validation.js";
import { queueNotification } from "./jobs.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 11 * 1024 * 1024, files: 1 } });
const tipStatuses = ["NEW", "REVIEWED", "IMPORTANT", "FORWARDED", "SPAM", "CLOSED", "FRAUD_SUSPECTED"];

export function createCommunityRouter({ db, config }) {
  const router = express.Router();

  router.post("/tips", upload.single("file"), asyncRoute(async (req, res) => {
    await verifyBot(req, config);
    await enforceRateLimit(db, "tip_submit", req.ip || "unknown", 5, 10 * 60 * 1000);
    const raw = typeof req.body.payload === "string" ? JSON.parse(req.body.payload) : req.body;
    const body = parse(z.object({
      caseId: z.string().min(3).max(50), tipType: z.string().min(2).max(80), firstHand: z.coerce.boolean(), occurredAt: z.string().datetime().optional(),
      unknownTime: z.coerce.boolean().default(false), location: z.string().max(500), municipality: z.string().max(120).optional(), confidence: z.string().min(2).max(80),
      description: z.string().min(10).max(5000), reporterContact: z.string().max(254).optional(),
    }), raw);
    const caseRow = await getCase(db, body.caseId);
    if (caseRow.admin_status !== "PUBLISHED") throw new ApiError(409, "CASE_NOT_EDITABLE", "This case is not accepting public tips");
    let inspected;
    if (req.file) inspected = await inspectUpload(req.file.buffer, req.file.mimetype, "private", config);
    const id = opaqueId();
    const duplicate = await db.prepare("SELECT id FROM tips WHERE case_id = ? AND lower(trim(description)) = lower(trim(?)) AND created_at > ? LIMIT 1")
      .get(caseRow.id, body.description, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const signals = [...detectRiskSignals(body.description), ...(duplicate ? ["DUPLICATE_TIP"] : [])];
    const quality = informationQuality({ firstHand: body.firstHand, occurredAt: body.occurredAt, locationText: body.location, municipality: body.municipality, hasAttachment: Boolean(req.file), reporterContact: body.reporterContact, description: body.description });
    const highRisk = signals.some((signal) => ["PAYMENT_DEMAND", "EXTORTION_LANGUAGE", "THREAT", "SUSPICIOUS_LINK"].includes(signal));
    const status = highRisk ? "FRAUD_SUSPECTED" : duplicate ? "SPAM" : "NEW";
    const now = isoNow();
    const stored = req.file && inspected ? await persistObject(req.file.buffer, "private", inspected.extension, config, inspected.mime) : null;
    let reference;
    await transaction(db, async (tx) => {
      reference = `TIP-${String(await nextCounter(tx, "public_tip")).padStart(4, "0")}`;
      await tx.prepare(`INSERT INTO tips(id, reference_code, case_id, tip_type, first_hand, occurred_at, unknown_time, location_text, municipality, confidence,
        description, reporter_contact_encrypted, information_quality, moderation_status, fraud_status, submitted_ip_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, reference, caseRow.id, body.tipType, body.firstHand ? 1 : 0, body.occurredAt || null, body.unknownTime ? 1 : 0, body.location,
          body.municipality || null, body.confidence, body.description, encryptSensitive(body.reporterContact, config.dataEncryptionKey), quality, status,
          highRisk ? "FRAUD_SAFETY_REVIEW" : "NO_FLAG", req.ip ? opaqueId() : null, now, now);
      for (const signal of new Set(signals)) {
        await tx.prepare("INSERT INTO risk_signals(id, resource_type, resource_id, signal_type, source, status, created_at) VALUES (?, 'TIP', ?, ?, 'RULE_ASSISTED_TRIAGE', 'OPEN', ?)")
          .run(opaqueId(), id, signal, now);
      }
      if (req.file && inspected && stored) {
        await tx.prepare(`INSERT INTO tip_attachments(id, tip_id, storage_key, original_name, detected_mime, size_bytes, sha256, scan_status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(opaqueId(), id, stored.key, req.file.originalname.slice(0, 255), inspected.mime, req.file.size, inspected.sha256, stored.scanStatus, now);
      }
      await audit(tx, req, "TIP_SUBMITTED", "TIP", id, null, null);
      if (highRisk) await audit(tx, req, "TIP_ROUTED_TO_FRAUD_REVIEW", "TIP", id, signals.join(", "), null);
    });
    if (highRisk) await queueNotification(db, {
      eventType: "FRAUD_SAFETY_REVIEW",
      payload: {},
      idempotencyKey: `fraud-review:${id}`,
    });
    res.status(201).json({ tip: { id: reference, status: "SUBMITTED" } });
  }));

  router.post("/reports", asyncRoute(async (req, res) => {
    await verifyBot(req, config);
    await enforceRateLimit(db, "case_report", req.ip || "unknown", 5, 60 * 60 * 1000);
    const body = parse(z.object({ caseId: z.string(), reason: z.enum(["PERSON_NOT_MISSING", "I_AM_THE_PERSON", "INCORRECT_INFORMATION", "UNAUTHORIZED_PUBLICATION", "PRIVACY_CONCERN", "POSSIBLE_FRAUD", "OTHER"]), description: z.string().min(10).max(5000), reporterContact: z.string().max(254).optional() }), req.body);
    const caseRow = await getCase(db, body.caseId);
    if (!["PUBLISHED", "FOUND"].includes(caseRow.admin_status)) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Case not publicly reportable");
    const id = opaqueId();
    const priority = ["I_AM_THE_PERSON", "UNAUTHORIZED_PUBLICATION"].includes(body.reason) ? "URGENT_PRIVACY" : body.reason === "POSSIBLE_FRAUD" ? "HIGH" : "NORMAL";
    const now = isoNow();
    let publicId;
    await transaction(db, async (tx) => {
    publicId = `REP-${String(await nextCounter(tx, "public_report")).padStart(4, "0")}`;
    await tx.prepare(`INSERT INTO case_reports(id, public_report_id, case_id, reason, description, status, priority, reporter_contact_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'SUBMITTED', ?, ?, ?, ?)`)
      .run(id, publicId, caseRow.id, body.reason, body.description, priority, encryptSensitive(body.reporterContact, config.dataEncryptionKey), now, now);
    await audit(tx, req, "CASE_REPORT_SUBMITTED", "CASE_REPORT", id, null, null);
    });
    res.status(201).json({ report: { id: publicId, status: "SUBMITTED" } });
  }));

  router.post("/privacy-requests", asyncRoute(async (req, res) => {
    await verifyBot(req, config);
    await enforceRateLimit(db, "privacy_request", req.ip || "unknown", 5, 60 * 60 * 1000);
    const body = parse(z.object({ type: z.enum(["ACCESS", "CORRECTION", "REMOVAL", "RESTRICTION", "UNAUTHORIZED_PUBLICATION", "DELETE_ACCOUNT", "OTHER"]), objectType: z.enum(["CASE", "ACCOUNT"]).default("CASE"), objectId: z.string().max(100).optional(), description: z.string().min(10).max(5000), contact: z.string().min(3).max(254) }), req.body);
    let internalObjectId = body.objectId || null;
    if (body.objectType === "CASE" && body.objectId) internalObjectId = (await getCase(db, body.objectId)).id;
    const id = opaqueId();
    let publicId;
    const now = isoNow();
    await transaction(db, async (tx) => {
      publicId = `PRQ-${String(await nextCounter(tx, "public_privacy")).padStart(4, "0")}`;
      await tx.prepare(`INSERT INTO privacy_requests(id, public_request_id, requester_user_id, type, object_type, object_id, description, contact_encrypted, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)`)
        .run(id, publicId, req.auth?.userId || null, body.type, body.objectType, internalObjectId, body.description, encryptSensitive(body.contact, config.dataEncryptionKey), now, now);
      await tx.prepare("INSERT INTO privacy_request_history(id, privacy_request_id, new_status, actor_id, created_at) VALUES (?, ?, 'SUBMITTED', ?, ?)")
        .run(opaqueId(), id, req.auth?.userId || null, now);
      await audit(tx, req, "PRIVACY_REQUEST_CREATED", "PRIVACY_REQUEST", id, body.type, req.auth || null);
    });
    res.status(201).json({ privacyRequest: { id: publicId, status: "SUBMITTED" } });
  }));

  router.use(requireAuth);

  router.get("/tips/moderation", requirePermission(db, "TIP_READ"), asyncRoute(async (req, res) => {
    const query = parse(z.object({ status: z.enum(tipStatuses).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(50) }), req.query);
    res.json({ tips: (await listTips(db, { status: query.status, limit: query.limit, offset: (query.page - 1) * query.limit })).map(tipDTO) });
  }));

  router.get("/tips/:id", requirePermission(db, "TIP_READ"), asyncRoute(async (req, res) => {
    const row = await getTip(db, req.params.id);
    await logSensitiveAccess(db, req, "TIP", row.id, "TIP_VIEWED");
    res.set("Cache-Control", "private, no-store").json({ tip: tipDTO(row) });
  }));

  router.post("/tips/:id/moderate", requirePermission(db, "TIP_REVIEW"), asyncRoute(async (req, res) => {
    const body = parse(z.object({ status: z.enum(tipStatuses), reason: z.string().max(1000).optional() }), req.body);
    const row = await getTip(db, req.params.id);
    const now = isoNow();
    await transaction(db, async (tx) => {
      await tx.prepare("UPDATE tips SET moderation_status = ?, fraud_status = CASE WHEN ? IN ('FRAUD_SUSPECTED','SPAM') THEN 'FRAUD_SAFETY_REVIEW' ELSE fraud_status END, updated_at = ? WHERE id = ?")
        .run(body.status, body.status, now, row.id);
      await tx.prepare("INSERT INTO moderation_actions(id, object_type, object_id, action, actor_id, actor_role, reason, created_at) VALUES (?, 'TIP', ?, ?, ?, ?, ?, ?)")
        .run(opaqueId(), row.id, body.status, req.auth.userId, req.auth.role, body.reason || null, now);
      await audit(tx, req, body.status === "FORWARDED" ? "TIP_FORWARDED" : body.status === "CLOSED" ? "TIP_CLOSED" : "TIP_REVIEWED", "TIP", row.id, body.reason || body.status);
    });
    res.json({ tip: tipDTO(await getTip(db, row.id)) });
  }));

  router.post("/tip-attachments/:id/access", requirePermission(db, "TIP_READ"), asyncRoute(async (req, res) => {
    const attachment = await db.prepare("SELECT * FROM tip_attachments WHERE id = ? AND removed_at IS NULL AND scan_status = 'CLEAN'").get(req.params.id);
    if (!attachment) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Attachment not found");
    const expiresAt = Date.now() + config.signedUrlTtlSeconds * 1000;
    const remoteUrl = await privateDownloadUrl(attachment.storage_key, config);
    const signature = remoteUrl ? null : signedDownloadToken(`${attachment.id}:${req.auth.userId}`, expiresAt, config);
    await logSensitiveAccess(db, req, "TIP_ATTACHMENT", attachment.id, "SIGNED_URL_ISSUED");
    res.json({ url: remoteUrl || `/api/tip-attachments/${attachment.id}/download?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`, expiresAt });
  }));

  router.get("/tip-attachments/:id/download", requirePermission(db, "TIP_READ"), asyncRoute(async (req, res) => {
    const attachment = await db.prepare("SELECT * FROM tip_attachments WHERE id = ? AND removed_at IS NULL AND scan_status = 'CLEAN'").get(req.params.id);
    if (!attachment) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Attachment not found");
    verifySignedDownload(`${attachment.id}:${req.auth.userId}`, req.query.expires, req.query.signature, config);
    await logSensitiveAccess(db, req, "TIP_ATTACHMENT", attachment.id, "ATTACHMENT_DOWNLOADED");
    res.set("Content-Type", attachment.detected_mime).set("Cache-Control", "private, no-store").send(await readPrivateObject(attachment.storage_key, config));
  }));

  router.get("/reports/moderation", requirePermission(db, "CASE_MODERATE"), asyncRoute(async (req, res) => {
    const reports = await db.prepare(`SELECT cr.*, c.public_case_id FROM case_reports cr JOIN cases c ON c.id = cr.case_id ORDER BY CASE cr.priority WHEN 'URGENT_PRIVACY' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END, cr.created_at DESC`).all();
    res.json({ reports: reports.map((row) => ({ id: row.public_report_id, internalId: row.id, caseId: row.public_case_id, reason: row.reason, description: row.description, status: row.status, priority: row.priority, createdAt: row.created_at })) });
  }));

  router.get("/privacy-requests/moderation", requirePermission(db, "PRIVACY_REVIEW"), asyncRoute(async (req, res) => {
    const requests = await db.prepare("SELECT * FROM privacy_requests ORDER BY created_at DESC").all();
    res.json({ privacyRequests: requests.map((row) => ({ id: row.public_request_id, internalId: row.id, type: row.type, objectId: row.object_id, status: row.status, createdAt: row.created_at })) });
  }));

  router.post("/privacy-requests/:id/status", requirePermission(db, "PRIVACY_REVIEW"), asyncRoute(async (req, res) => {
    const body = parse(z.object({ status: z.enum(["SUBMITTED", "UNDER_REVIEW", "NEEDS_INFORMATION", "APPROVED", "REJECTED", "COMPLETED"]), reason: z.string().max(1000).optional() }), req.body);
    const row = await db.prepare("SELECT * FROM privacy_requests WHERE id = ? OR public_request_id = ?").get(req.params.id, req.params.id);
    if (!row) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Privacy request not found");
    const now = isoNow();
    await transaction(db, async (tx) => {
      await tx.prepare("UPDATE privacy_requests SET status = ?, updated_at = ? WHERE id = ?").run(body.status, now, row.id);
      await tx.prepare("INSERT INTO privacy_request_history(id, privacy_request_id, previous_status, new_status, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(opaqueId(), row.id, row.status, body.status, req.auth.userId, body.reason || null, now);
      await audit(tx, req, "PRIVACY_REQUEST_UPDATED", "PRIVACY_REQUEST", row.id, body.reason || body.status);
    });
    res.json({ privacyRequest: { id: row.public_request_id, status: body.status } });
  }));

  router.get("/audit", requirePermission(db, "AUDIT_READ"), asyncRoute(async (req, res) => {
    const events = await db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT 500").all();
    res.set("Cache-Control", "private, no-store").json({ auditEvents: events.map((row) => ({ id: row.id, actor: row.actor_role || "PUBLIC", actorId: row.actor_id, action: row.action, target: row.resource_id, resourceType: row.resource_type, reason: row.reason, timestamp: row.created_at })) });
  }));

  router.get("/moderation/bootstrap", asyncRoute(async (req, res) => {
    const permissions = await permissionsFor(db, req.auth.role);
    const result = { role: req.auth.role, permissions };
    if (permissions.includes("TIP_READ")) result.tips = (await listTips(db, { limit: 50 })).map(tipDTO);
    if (permissions.includes("AUDIT_READ")) result.auditEvents = await db.prepare(`SELECT ae.id, ae.actor_role actor, ae.action,
      CASE WHEN ae.resource_type = 'CASE' THEN COALESCE((SELECT c.public_case_id FROM cases c WHERE c.id = ae.resource_id), ae.resource_id) ELSE ae.resource_id END target,
      ae.reason, ae.created_at timestamp FROM audit_events ae ORDER BY ae.created_at DESC LIMIT 500`).all();
    res.json(result);
  }));

  return router;
}
