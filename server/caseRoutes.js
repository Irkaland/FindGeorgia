import express from "express";
import multer from "multer";
import { z } from "zod";
import { nextCounter, transaction } from "./db.js";
import { ApiError, asyncRoute } from "./errors.js";
import { enqueueJob } from "./jobs.js";
import { getCase, listModeratorCases, listPublicCases } from "./repository.js";
import { adminCaseDTO, publicCaseDTO } from "./serializers.js";
import { audit, enforceRateLimit, isoNow, opaqueId, requireAuth, requirePermission } from "./security.js";
import { assertTransition } from "./stateMachine.js";
import { inspectUpload, persistObject, readPublicObject, sanitizePublicImage } from "./storage.js";
import { parse } from "./validation.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const localized = z.object({ ka: z.string().min(1).max(500), en: z.string().min(1).max(500) });
const sourceTypes = ["OFFICIAL_PUBLICATION", "POLICE_AGENCY", "TRUSTED_MEDIA", "VERIFIED_ORGANIZATION", "DIRECT_VERIFIED_CONTACT", "OTHER_REVIEWED_SOURCE"];
const caseInput = z.object({
  name: localized,
  sex: z.enum(["FEMALE", "MALE", "OTHER", "UNKNOWN"]).optional(),
  dateOfBirth: z.string().max(30).optional(),
  age: z.number().int().min(0).max(120).optional(),
  missingDate: localized,
  missingTime: z.string().max(20).optional(),
  region: localized,
  municipality: localized,
  location: localized,
  publicDescription: z.object({ ka: z.string().min(20).max(5000), en: z.string().min(20).max(5000) }),
  sourceType: z.enum(sourceTypes),
  sourceUrl: z.union([z.string().url().max(1000), z.literal("")]).optional(),
  sourceNote: z.string().min(5).max(5000),
  adminNotes: z.string().max(5000).optional(),
  publicImageUrl: z.string().regex(/^\/assets\//).optional(),
});

function reviewedLabels(now = new Date()) {
  return {
    ka: new Intl.DateTimeFormat("ka-GE", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tbilisi" }).format(now),
    en: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Tbilisi" }).format(now),
  };
}

export function createCaseRouter({ db, config }) {
  const router = express.Router();

  router.get("/public", asyncRoute(async (req, res) => {
    const query = parse(z.object({
      status: z.enum(["active", "found", "all"]).default("active"), region: z.string().max(100).optional(), municipality: z.string().max(120).optional(),
      sex: z.enum(["FEMALE", "MALE", "OTHER", "UNKNOWN"]).optional(), ageMin: z.coerce.number().int().min(0).max(120).optional(),
      ageMax: z.coerce.number().int().min(0).max(120).optional(), missingYear: z.string().regex(/^\d{4}$/).optional(), q: z.string().max(80).optional(),
      page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20),
    }), req.query);
    const { rows, total } = await listPublicCases(db, { ...query, query: query.q, offset: (query.page - 1) * query.limit });
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60").json({
      cases: rows.map(publicCaseDTO), pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    });
  }));

  router.get("/public/:publicCaseId", asyncRoute(async (req, res) => {
    const row = await getCase(db, req.params.publicCaseId);
    if (!["PUBLISHED", "FOUND", "CLOSED"].includes(row.admin_status)) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Case not publicly available");
    res.set("Cache-Control", row.admin_status === "PUBLISHED" ? "public, max-age=30" : "no-store").json({ case: publicCaseDTO(row) });
  }));

  router.get("/public-media/:publicCaseId", asyncRoute(async (req, res) => {
    const row = await getCase(db, req.params.publicCaseId);
    if (!row.public_image_storage_key || row.admin_status !== "PUBLISHED") throw new ApiError(404, "RESOURCE_NOT_FOUND", "Public image not available");
    res.set("Content-Type", req.query.format === "png" ? "image/png" : req.query.format === "webp" ? "image/webp" : "image/jpeg");
    res.set("Cache-Control", "public, max-age=86400, immutable").send(await readPublicObject(row.public_image_storage_key, config));
  }));

  router.use(requireAuth);

  router.get("/admin", requirePermission(db, "CASE_READ_ALL"), asyncRoute(async (req, res) => {
    const query = parse(z.object({ status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED", "FOUND", "CLOSED", "ARCHIVED"]).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(100) }), req.query);
    res.json({ cases: (await listModeratorCases(db, { state: query.status, limit: query.limit, offset: (query.page - 1) * query.limit })).map((row) => adminCaseDTO(row)) });
  }));

  router.post("/admin", requirePermission(db, "CASE_ADMIN_CREATE"), asyncRoute(async (req, res) => {
    await enforceRateLimit(db, "admin_case_create", req.auth.userId, 50, 24 * 60 * 60 * 1000);
    const body = parse(caseInput, req.body);
    const now = isoNow();
    const labels = reviewedLabels(new Date(now));
    const personId = opaqueId();
    const caseId = opaqueId();
    let publicId;
    await transaction(db, async (tx) => {
      publicId = `GEO-${String(await nextCounter(tx, "public_case")).padStart(5, "0")}`;
      await tx.prepare("INSERT INTO missing_people(id, name_ka, name_en, age, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(personId, body.name.ka, body.name.en, body.age ?? null, now, now);
      await tx.prepare(`INSERT INTO cases(id, public_case_id, missing_person_id, owner_user_id, state, admin_status, sex, date_of_birth, missing_time,
        location_ka, location_en, broad_location_ka, broad_location_en, region_ka, region_en, municipality_ka, municipality_en,
        missing_date_ka, missing_date_en, story_ka, story_en, public_image_url, last_verified_at, last_verified_ka, last_verified_en,
        privacy_review_status, indexing_policy, source_type, source_url, source_note, verified_by, verified_at, admin_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'DRAFT', 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_REQUIRED', 'NOINDEX', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(caseId, publicId, personId, req.auth.userId, body.sex || null, body.dateOfBirth || null, body.missingTime || null,
          body.location.ka, body.location.en, body.region.ka, body.region.en, body.region.ka, body.region.en, body.municipality.ka, body.municipality.en,
          body.missingDate.ka, body.missingDate.en, body.publicDescription.ka, body.publicDescription.en, body.publicImageUrl || null,
          now, labels.ka, labels.en, body.sourceType, body.sourceUrl || null, body.sourceNote, req.auth.userId, now, body.adminNotes || null, now, now);
      await tx.prepare("INSERT INTO case_status_history(id, case_id, previous_status, new_status, actor_id, reason, created_at) VALUES (?, ?, NULL, 'DRAFT', ?, 'Admin created case', ?)")
        .run(opaqueId(), caseId, req.auth.userId, now);
      await audit(tx, req, "CASE_CREATED", "CASE", caseId);
    });
    res.status(201).json({ case: adminCaseDTO(await getCase(db, caseId)) });
  }));

  router.get("/admin/:id/preview", requirePermission(db, "CASE_READ_ALL"), asyncRoute(async (req, res) => {
    const row = await getCase(db, req.params.id);
    const preview = publicCaseDTO({ ...row, admin_status: "PUBLISHED", state: "PUBLISHED", indexing_policy: "NOINDEX" });
    if (row.public_image_storage_key) {
      preview.image = `/api/cases/admin/${row.id}/public-image-file`;
      preview.publicPhoto = preview.image;
    }
    res.set("Cache-Control", "private, no-store").json({ case: preview });
  }));

  router.get("/admin/:id/public-image-file", requirePermission(db, "CASE_READ_ALL"), asyncRoute(async (req, res) => {
    const row = await getCase(db, req.params.id);
    if (!row.public_image_storage_key) throw new ApiError(404, "RESOURCE_NOT_FOUND", "Public image not available");
    const extension = row.public_image_storage_key.split(".").pop()?.toLowerCase();
    const mime = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    res.set("Content-Type", mime).set("Cache-Control", "private, no-store").send(await readPublicObject(row.public_image_storage_key, config));
  }));

  router.get("/admin/:id", requirePermission(db, "CASE_READ_ALL"), asyncRoute(async (req, res) => {
    res.set("Cache-Control", "private, no-store").json({ case: adminCaseDTO(await getCase(db, req.params.id)) });
  }));

  router.patch("/admin/:id", requirePermission(db, "CASE_ADMIN_EDIT"), asyncRoute(async (req, res) => {
    const body = parse(caseInput.partial().extend({ expectedVersion: z.number().int().positive().optional() }).refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), "Provide at least one change"), req.body);
    const now = isoNow();
    let row;
    await transaction(db, async (tx) => {
      row = await getCase(tx, req.params.id, { forUpdate: true });
      if (row.admin_status === "ARCHIVED") throw new ApiError(409, "CASE_NOT_EDITABLE", "Archived cases are read-only");
      const expectedVersion = body.expectedVersion ?? row.version;
      if (Number(expectedVersion) !== Number(row.version)) throw new ApiError(409, "STALE_WRITE", "This case changed since it was opened. Refresh and try again");
      if (body.name || body.age !== undefined) await tx.prepare("UPDATE missing_people SET name_ka = COALESCE(?, name_ka), name_en = COALESCE(?, name_en), age = COALESCE(?, age), updated_at = ? WHERE id = ?")
        .run(body.name?.ka || null, body.name?.en || null, body.age ?? null, now, row.missing_person_id);
      const changed = await tx.prepare(`UPDATE cases SET sex = COALESCE(?, sex), date_of_birth = COALESCE(?, date_of_birth), missing_time = COALESCE(?, missing_time),
        location_ka = COALESCE(?, location_ka), location_en = COALESCE(?, location_en), broad_location_ka = COALESCE(?, broad_location_ka), broad_location_en = COALESCE(?, broad_location_en),
        region_ka = COALESCE(?, region_ka), region_en = COALESCE(?, region_en), municipality_ka = COALESCE(?, municipality_ka), municipality_en = COALESCE(?, municipality_en),
        missing_date_ka = COALESCE(?, missing_date_ka), missing_date_en = COALESCE(?, missing_date_en), story_ka = COALESCE(?, story_ka), story_en = COALESCE(?, story_en),
        source_type = COALESCE(?, source_type), source_url = COALESCE(?, source_url), source_note = COALESCE(?, source_note), admin_notes = COALESCE(?, admin_notes),
        verified_by = CASE WHEN ? IS NOT NULL OR ? IS NOT NULL OR ? IS NOT NULL THEN ? ELSE verified_by END,
        verified_at = CASE WHEN ? IS NOT NULL OR ? IS NOT NULL OR ? IS NOT NULL THEN ? ELSE verified_at END,
        updated_at = ?, version = version + 1 WHERE id = ? AND version = ?`)
        .run(body.sex || null, body.dateOfBirth || null, body.missingTime || null, body.location?.ka || null, body.location?.en || null,
          body.region?.ka || null, body.region?.en || null, body.region?.ka || null, body.region?.en || null, body.municipality?.ka || null, body.municipality?.en || null,
          body.missingDate?.ka || null, body.missingDate?.en || null, body.publicDescription?.ka || null, body.publicDescription?.en || null,
          body.sourceType || null, body.sourceUrl || null, body.sourceNote || null, body.adminNotes || null,
          body.sourceType || null, body.sourceUrl || null, body.sourceNote || null, req.auth.userId,
          body.sourceType || null, body.sourceUrl || null, body.sourceNote || null, now, now, row.id, expectedVersion);
      if (!changed.changes) throw new ApiError(409, "STALE_WRITE", "This case changed since it was opened. Refresh and try again");
      await audit(tx, req, body.sourceType || body.sourceUrl || body.sourceNote ? "SOURCE_METADATA_UPDATED" : "CASE_EDITED", "CASE", row.id);
    });
    res.json({ case: adminCaseDTO(await getCase(db, row.id)) });
  }));

  router.post("/admin/:id/public-image", requirePermission(db, "EVIDENCE_UPLOAD"), upload.single("file"), asyncRoute(async (req, res) => {
    await enforceRateLimit(db, "admin_file_upload", req.auth.userId, 50, 60 * 60 * 1000);
    const row = await getCase(db, req.params.id);
    if (row.admin_status === "ARCHIVED") throw new ApiError(409, "CASE_NOT_EDITABLE", "Archived cases are read-only");
    if (!req.file) throw new ApiError(422, "FILE_REJECTED", "Select an image to upload");
    const inspected = await inspectUpload(req.file.buffer, req.file.mimetype, "public", config);
    const sanitized = await sanitizePublicImage(req.file.buffer, inspected.mime);
    const stored = await persistObject(sanitized, "public", inspected.extension, config, inspected.mime);
    const url = `/api/cases/public-media/${row.public_case_id}?format=${inspected.extension}`;
    await db.prepare("UPDATE cases SET public_image_url = ?, public_image_storage_key = ?, updated_at = ?, version = version + 1 WHERE id = ?").run(url, stored.key, isoNow(), row.id);
    await audit(db, req, "CASE_PHOTO_CHANGED", "CASE", row.id, "Metadata removed before storage and malware scan passed");
    res.status(201).json({ image: { url, detectedMime: inspected.mime, metadataStripped: true } });
  }));

  router.post("/admin/:id/publish", requirePermission(db, "CASE_ADMIN_PUBLISH"), transitionRoute(db, "PUBLISHED", "CASE_PUBLISHED"));
  router.post("/admin/:id/unpublish", requirePermission(db, "CASE_ADMIN_PUBLISH"), transitionRoute(db, "UNPUBLISHED", "CASE_UNPUBLISHED"));
  router.post("/admin/:id/found", requirePermission(db, "CASE_ADMIN_EDIT"), transitionRoute(db, "FOUND", "CASE_FOUND"));
  router.post("/admin/:id/close", requirePermission(db, "CASE_ADMIN_EDIT"), transitionRoute(db, "CLOSED", "CASE_CLOSED"));
  router.post("/admin/:id/archive", requirePermission(db, "CASE_ADMIN_ARCHIVE"), transitionRoute(db, "ARCHIVED", "CASE_ARCHIVED"));

  return router;
}

function transitionRoute(db, targetStatus, action) {
  return asyncRoute(async (req, res) => {
    const { reason } = parse(z.object({ reason: z.string().max(1000).optional() }), req.body || {});
    const now = isoNow();
    const labels = reviewedLabels(new Date(now));
    const legacyState = { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED", UNPUBLISHED: "SUSPENDED", FOUND: "FOUND", CLOSED: "CLOSED", ARCHIVED: "CLOSED" }[targetStatus];
    const extra = [];
    const values = [targetStatus, legacyState, now, labels.ka, labels.en];
    if (targetStatus === "PUBLISHED") { extra.push("published_at = ?", "indexing_policy = 'INDEX'", "unpublished_at = NULL"); values.push(now); }
    if (targetStatus === "UNPUBLISHED") { extra.push("unpublished_at = ?", "indexing_policy = 'NOINDEX'"); values.push(now); }
    if (targetStatus === "FOUND") { extra.push("found_at = ?", "indexing_policy = 'NOINDEX'", "privacy_review_status = 'PENDING'"); values.push(now); }
    if (targetStatus === "CLOSED") { extra.push("closed_at = ?", "indexing_policy = 'NOINDEX'"); values.push(now); }
    if (targetStatus === "ARCHIVED") { extra.push("archived_at = ?", "indexing_policy = 'NOINDEX'"); values.push(now); }
    let row;
    let alreadyApplied = false;
    await transaction(db, async (tx) => {
      row = await getCase(tx, req.params.id, { forUpdate: true });
      if (row.admin_status === targetStatus) { alreadyApplied = true; return; }
      assertTransition(row.admin_status, targetStatus);
      if (targetStatus === "PUBLISHED" && (!row.public_image_url || !row.source_type || !row.source_note || !row.story_en || !row.story_ka)) {
        throw new ApiError(422, "PUBLICATION_REQUIREMENTS_MISSING", "Photo, public description, and reviewed source information are required before publication");
      }
      await tx.prepare(`UPDATE cases SET admin_status = ?, state = ?, updated_at = ?, last_verified_ka = ?, last_verified_en = ?, version = version + 1${extra.length ? `, ${extra.join(", ")}` : ""} WHERE id = ?`)
        .run(...values, row.id);
      await tx.prepare("INSERT INTO case_status_history(id, case_id, previous_status, new_status, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(opaqueId(), row.id, row.admin_status, targetStatus, req.auth.userId, reason || null, now);
      await audit(tx, req, action, "CASE", row.id, reason);
    });
    if (targetStatus === "FOUND" && !alreadyApplied) await enqueueJob(db, "FOUND_CASE_PRIVACY_REVIEW_REMINDER", { caseId: row.id }, `found-privacy:${row.id}`);
    res.json({ case: adminCaseDTO(await getCase(db, row.id)), idempotentReplay: alreadyApplied });
  });
}
