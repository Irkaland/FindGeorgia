import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { createEncryptedBackup, restoreEncryptedBackup } from "../server/backup.js";
import { loadConfig } from "../server/config.js";
import { openDatabase } from "../server/db.js";
import { runOneJob } from "../server/jobs.js";
import { currentMfa } from "../server/security.js";
import { DEMO_MFA_SECRET, DEMO_PASSWORD, seedDatabase } from "../server/seed.js";
import { assertTransition } from "../server/stateMachine.js";

let root;
let db;
let app;
let config;

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const newCaseBody = (suffix = "Alpha") => ({
  name: { ka: `ადმინისტრატორის ტესტი ${suffix}`, en: `Admin Test ${suffix}` },
  sex: "UNKNOWN", age: 29,
  missingDate: { ka: "24 აგვისტო, 2026", en: "24 August 2026" }, missingTime: "12:30",
  region: { ka: "თბილისი", en: "Tbilisi" }, municipality: { ka: "თბილისი", en: "Tbilisi" },
  location: { ka: "თბილისი", en: "Tbilisi" },
  publicDescription: { ka: "ეს არის მხოლოდ გამოგონილი, საკმარისად გრძელი სატესტო საჯარო აღწერა.", en: "This is a fictional and sufficiently detailed public test description." },
  sourceType: "TRUSTED_MEDIA", sourceUrl: "https://example.test/internal-source",
  sourceNote: "Reviewed fictional source for the admin-managed Alpha test.", adminNotes: "Internal test note that must never be public.",
});

before(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), "find-georgia-admin-test-"));
  config = loadConfig({ env: "development", databasePath: path.join(root, "test.sqlite"), privateStorageDir: path.join(root, "private"), publicMediaDir: path.join(root, "public"), backupDir: path.join(root, "backups"), signedUrlSecret: "test-secret-with-at-least-thirty-two-characters", appOrigin: "http://localhost:4173", exposeDevHelpers: true, enableJobs: false });
  db = openDatabase(config.databasePath);
  await seedDatabase(db, config);
  app = createApp({ db, config });
});

after(() => {
  db?.close();
  if (root?.startsWith(os.tmpdir())) rmSync(root, { recursive: true, force: true });
});

async function csrf(agent) { return (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken; }
async function post(agent, url, token, body = {}) { return agent.post(url).set("origin", config.appOrigin).set("x-csrf-token", token).send(body); }
async function login(email, targetApp = app, targetConfig = config) {
  const agent = request.agent(targetApp);
  const token = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
  const response = await agent.post("/api/auth/login").set("origin", targetConfig.appOrigin).set("x-csrf-token", token).send({ email, password: DEMO_PASSWORD, mfaCode: await currentMfa(DEMO_MFA_SECRET) });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { agent, token, user: response.body.user };
}

test("clean migration installs the simplified active role and state model", () => {
  assert.deepEqual(db.prepare("SELECT DISTINCT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id JOIN users u ON u.id = ur.user_id WHERE u.disabled_at IS NULL ORDER BY r.name").all().map((row) => row.name), ["ADMIN", "SUPER_ADMIN", "TIP_REVIEWER"]);
  assert.deepEqual(db.prepare("SELECT name FROM schema_migrations ORDER BY name").all().map((row) => row.name), ["001_initial.sql", "002_public_media.sql", "003_admin_managed_model.sql", "004_production_controls.sql"]);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM architecture_deprecations WHERE object_name = 'family_relationships'").get().count, 1);
});

test("family enrollment and self-service case endpoints are gone", async () => {
  const visitor = request.agent(app); const token = await csrf(visitor);
  assert.equal((await post(visitor, "/api/auth/register", token, { email: "family@example.test", password: "SecureFamily!2026" })).status, 404);
  await visitor.get("/api/cases/mine").expect(401);
  assert.equal((await post(visitor, "/api/cases", token, newCaseBody("Public attempt"))).status, 401);
});

test("admin authentication requires MFA and server-held permissions", async () => {
  const agent = request.agent(app); const token = await csrf(agent);
  const challenge = await post(agent, "/api/auth/login", token, { email: "moderator@example.test", password: DEMO_PASSWORD });
  assert.equal(challenge.status, 403);
  assert.equal(challenge.body.error.code, "MFA_REQUIRED");
  const admin = await login("moderator@example.test");
  assert.equal(admin.user.role, "ADMIN");
  assert.ok(admin.user.permissions.includes("CASE_ADMIN_PUBLISH"));
  const reviewer = await login("tip.reviewer@example.test");
  const denied = await post(reviewer.agent, "/api/cases/admin", reviewer.token, newCaseBody("Reviewer attempt"));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FORBIDDEN");
});

test("password recovery queues an encrypted, single-use email job", async () => {
  const agent = request.agent(app); const token = await csrf(agent);
  const originalPasswordHash = db.prepare("SELECT password_hash FROM users WHERE email = ?").get("moderator@example.test").password_hash;
  const response = await post(agent, "/api/auth/password-reset/request", token, { email: "moderator@example.test" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.ok(response.body.developmentResetToken);
  const job = db.prepare("SELECT * FROM background_jobs WHERE job_type = 'PASSWORD_RESET_EMAIL' ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(job);
  assert.equal(job.payload.includes(response.body.developmentResetToken), false);
  const parsed = JSON.parse(job.payload);
  assert.match(parsed.tokenEncrypted, /^v1\./);
  assert.equal((await runOneJob(db, {}, { config, workerId: "test-password-worker" })).status, "COMPLETED");
  assert.equal(db.prepare("SELECT status FROM background_jobs WHERE id = ?").get(job.id).status, "COMPLETED");
  const changed = await post(agent, "/api/auth/password-reset/confirm", token, { token: response.body.developmentResetToken, password: "ChangedPassword!2026" });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  const replay = await post(agent, "/api/auth/password-reset/confirm", token, { token: response.body.developmentResetToken, password: "ChangedPassword!2026" });
  assert.equal(replay.status, 400);
  assert.equal(replay.body.error.code, "TOKEN_INVALID");
  db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(originalPasswordHash, "moderator@example.test");
});

test("admin creates a private draft and public DTO never leaks internal source fields", async () => {
  const admin = await login("moderator@example.test");
  const created = await post(admin.agent, "/api/cases/admin", admin.token, newCaseBody("Draft"));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.case.adminStatus, "DRAFT");
  assert.equal(created.body.case.sourceNote.includes("internal"), false);
  await request(app).get(`/api/cases/public/${created.body.case.id}`).expect(404);
  const preview = await admin.agent.get(`/api/cases/admin/${created.body.case.internalId}/preview`).expect(200);
  const serialized = JSON.stringify(preview.body);
  for (const forbidden of ["sourceType", "sourceUrl", "sourceNote", "adminNotes", "internalId", "verifiedBy"]) assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked in preview`);
});

test("publication requires a photo, then exposes only the explicit public DTO", async () => {
  const admin = await login("moderator@example.test");
  const created = await post(admin.agent, "/api/cases/admin", admin.token, newCaseBody("Publish"));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.case.internalId;
  const rejected = await post(admin.agent, `/api/cases/admin/${id}/publish`, admin.token, { reason: "Missing photo" });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.error.code, "PUBLICATION_REQUIREMENTS_MISSING");
  const upload = await admin.agent.post(`/api/cases/admin/${id}/public-image`).set("origin", config.appOrigin).set("x-csrf-token", admin.token).attach("file", png, { filename: "public.png", contentType: "image/png" });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  assert.equal(upload.body.image.metadataStripped, true);
  const draftPreview = await admin.agent.get(`/api/cases/admin/${id}/preview`).expect(200);
  assert.match(draftPreview.body.case.image, /^\/api\/cases\/admin\//);
  await admin.agent.get(draftPreview.body.case.image).expect(200);
  await request(app).get(draftPreview.body.case.image).expect(401);
  const published = await post(admin.agent, `/api/cases/admin/${id}/publish`, admin.token, { reason: "Reviewed source and public content" });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  const publicCase = await request(app).get(`/api/cases/public/${created.body.case.id}`).expect(200);
  assert.equal(publicCase.body.case.verificationStatus, "Published");
  for (const forbidden of ["sourceType", "sourceUrl", "sourceNote", "adminNotes", "internalId", "ownerUserId", "evidence"]) assert.equal(Object.hasOwn(publicCase.body.case, forbidden), false);
  assert.doesNotMatch(JSON.stringify(publicCase.body), /internal-source|Internal test note/);
});

test("concurrent publication is serialized and an exact replay is idempotent", async () => {
  const admin = await login("moderator@example.test");
  const created = await post(admin.agent, "/api/cases/admin", admin.token, newCaseBody("Concurrent publish"));
  const id = created.body.case.internalId;
  await admin.agent.post(`/api/cases/admin/${id}/public-image`).set("origin", config.appOrigin).set("x-csrf-token", admin.token).attach("file", png, { filename: "public.png", contentType: "image/png" }).expect(201);
  const [first, second] = await Promise.all([
    post(admin.agent, `/api/cases/admin/${id}/publish`, admin.token, { reason: "Concurrent publication" }),
    post(admin.agent, `/api/cases/admin/${id}/publish`, admin.token, { reason: "Concurrent publication" }),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 200]);
  assert.equal([first.body.idempotentReplay, second.body.idempotentReplay].filter(Boolean).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM case_status_history WHERE case_id = ? AND new_status = 'PUBLISHED'").get(id).count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_events WHERE resource_id = ? AND action = 'CASE_PUBLISHED'").get(id).count, 1);
});

test("optimistic case edits reject a stale version", async () => {
  const admin = await login("moderator@example.test");
  const row = db.prepare("SELECT id, version FROM cases WHERE admin_status = 'PUBLISHED' ORDER BY public_case_id LIMIT 1").get();
  const stale = await admin.agent.patch(`/api/cases/admin/${row.id}`).set("origin", config.appOrigin).set("x-csrf-token", admin.token)
    .send({ expectedVersion: row.version + 99, adminNotes: "This stale update must not be stored." });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, "STALE_WRITE");
});

test("admin edit immediately updates a published case and writes audit", async () => {
  const admin = await login("moderator@example.test");
  const row = db.prepare("SELECT id FROM cases WHERE admin_status = 'PUBLISHED' ORDER BY public_case_id LIMIT 1").get();
  const changedText = "An updated fictional public description written by an authorized administrator.";
  const before = db.prepare("SELECT COUNT(*) count FROM audit_events").get().count;
  const updated = await admin.agent.patch(`/api/cases/admin/${row.id}`).set("origin", config.appOrigin).set("x-csrf-token", admin.token).send({ publicDescription: { ka: "ადმინისტრატორის მიერ განახლებული საკმარისად გრძელი საჯარო აღწერა.", en: changedText } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  const publicCase = await request(app).get(`/api/cases/public/${updated.body.case.id}`).expect(200);
  assert.equal(publicCase.body.case.story.en, changedText);
  assert.ok(db.prepare("SELECT COUNT(*) count FROM audit_events").get().count > before);
});

test("Found minimizes public data and later closure/archive removes public access", async () => {
  const admin = await login("moderator@example.test");
  const row = db.prepare("SELECT id, public_case_id FROM cases WHERE admin_status = 'PUBLISHED' ORDER BY public_case_id DESC LIMIT 1").get();
  assert.equal((await post(admin.agent, `/api/cases/admin/${row.id}/found`, admin.token, { reason: "Confirmed found by admin" })).status, 200);
  const minimized = await request(app).get(`/api/cases/public/${row.public_case_id}`).expect(200);
  assert.equal(minimized.body.case.status, "Found");
  assert.equal(minimized.body.case.story, undefined);
  assert.equal(minimized.body.case.location, undefined);
  assert.equal((await post(admin.agent, `/api/cases/admin/${row.id}/close`, admin.token, { reason: "Public follow-up complete" })).status, 200);
  assert.equal((await post(admin.agent, `/api/cases/admin/${row.id}/archive`, admin.token, { reason: "Retention archive" })).status, 200);
  await request(app).get(`/api/cases/public/${row.public_case_id}`).expect(404);
});

test("public tips work only for published cases and stay private", async () => {
  const visitor = request.agent(app); const token = await csrf(visitor);
  const published = db.prepare("SELECT public_case_id FROM cases WHERE admin_status = 'PUBLISHED' LIMIT 1").get();
  const contact = "private-tip@example.test";
  const submitted = await visitor.post("/api/tips").set("origin", config.appOrigin).set("x-csrf-token", token).set("x-bot-token", config.botDevToken).send({ caseId: published.public_case_id, tipType: "POSSIBLE_LOCATION", firstHand: true, occurredAt: "2026-08-24T10:00:00.000Z", unknownTime: false, location: "A private exact location", municipality: "Tbilisi", confidence: "RECOGNIZED", description: "A detailed private first-hand observation for authorized review.", reporterContact: contact });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.deepEqual(Object.keys(submitted.body.tip).sort(), ["id", "status"]);
  const encrypted = db.prepare("SELECT reporter_contact_encrypted FROM tips WHERE reference_code = ?").get(submitted.body.tip.id).reporter_contact_encrypted;
  assert.ok(encrypted.startsWith("v1."));
  assert.equal(encrypted.includes(contact), false);
  const draft = db.prepare("SELECT public_case_id FROM cases WHERE admin_status = 'DRAFT' LIMIT 1").get();
  const denied = await visitor.post("/api/tips").set("origin", config.appOrigin).set("x-csrf-token", token).set("x-bot-token", config.botDevToken).send({ caseId: draft.public_case_id, tipType: "OTHER", firstHand: false, unknownTime: true, location: "Private", confidence: "UNSURE", description: "A tip that must not attach to an unpublished draft." });
  assert.equal(denied.status, 409);
});

test("tip reviewer can moderate tips but anonymous attachment access is denied", async () => {
  const reviewer = await login("tip.reviewer@example.test");
  const tip = db.prepare("SELECT id FROM tips ORDER BY created_at DESC LIMIT 1").get();
  const moderated = await post(reviewer.agent, `/api/tips/${tip.id}/moderate`, reviewer.token, { status: "IMPORTANT", reason: "Human review" });
  assert.equal(moderated.status, 200);
  assert.equal(moderated.body.tip.moderationStatus, "IMPORTANT");
  assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action = 'TIP_REVIEWED' AND resource_id = ?").get(tip.id).count, 1);
  await request(app).post("/api/tip-attachments/not-a-real-id/access").expect(403);
});

test("state transitions, CSRF, append-only audit, and unsafe production config fail closed", async () => {
  assert.doesNotThrow(() => assertTransition("DRAFT", "PUBLISHED"));
  assert.throws(() => assertTransition("DRAFT", "FOUND"));
  const withoutCsrf = await request(app).post("/api/auth/login").send({ email: "moderator@example.test", password: DEMO_PASSWORD });
  assert.equal(withoutCsrf.status, 403);
  const event = db.prepare("SELECT id FROM audit_events LIMIT 1").get();
  assert.throws(() => db.prepare("UPDATE audit_events SET reason = 'tampered' WHERE id = ?").run(event.id), /append-only/i);
  assert.throws(() => loadConfig({ env: "production", signedUrlSecret: "short", appOrigin: "http://example.test", botProvider: "development" }), /SIGNED_URL_SECRET/);
});

test("admin create-publish-tip-found-close-archive flow persists across restart", async () => {
  const integrationRoot = mkdtempSync(path.join(os.tmpdir(), "find-georgia-admin-flow-"));
  const integrationConfig = loadConfig({ env: "development", databasePath: path.join(integrationRoot, "integration.sqlite"), privateStorageDir: path.join(integrationRoot, "private"), publicMediaDir: path.join(integrationRoot, "public"), backupDir: path.join(integrationRoot, "backups"), signedUrlSecret: "integration-secret-with-at-least-thirty-two-characters", appOrigin: "http://localhost:4173", exposeDevHelpers: true, enableJobs: false });
  let integrationDb = openDatabase(integrationConfig.databasePath);
  try {
    await seedDatabase(integrationDb, integrationConfig);
    let integrationApp = createApp({ db: integrationDb, config: integrationConfig });
    const admin = await login("moderator@example.test", integrationApp, integrationConfig);
    const created = await admin.agent.post("/api/cases/admin").set("origin", integrationConfig.appOrigin).set("x-csrf-token", admin.token).send(newCaseBody("Vertical"));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const internalId = created.body.case.internalId; const publicId = created.body.case.id;
    await admin.agent.post(`/api/cases/admin/${internalId}/public-image`).set("origin", integrationConfig.appOrigin).set("x-csrf-token", admin.token).attach("file", png, { filename: "public.png", contentType: "image/png" }).expect(201);
    await admin.agent.post(`/api/cases/admin/${internalId}/publish`).set("origin", integrationConfig.appOrigin).set("x-csrf-token", admin.token).send({ reason: "Complete admin review" }).expect(200);
    const visitor = request.agent(integrationApp); const visitorToken = (await visitor.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const tip = await visitor.post("/api/tips").set("origin", integrationConfig.appOrigin).set("x-csrf-token", visitorToken).set("x-bot-token", integrationConfig.botDevToken).send({ caseId: publicId, tipType: "POSSIBLE_LOCATION", firstHand: true, unknownTime: true, location: "Private integration location", confidence: "MAYBE", description: "A complete private tip in the admin-managed vertical slice." });
    assert.equal(tip.status, 201, JSON.stringify(tip.body));
    await admin.agent.post(`/api/cases/admin/${internalId}/found`).set("origin", integrationConfig.appOrigin).set("x-csrf-token", admin.token).send({ reason: "Confirmed found" }).expect(200);
    await admin.agent.post(`/api/cases/admin/${internalId}/close`).set("origin", integrationConfig.appOrigin).set("x-csrf-token", admin.token).send({ reason: "Closure complete" }).expect(200);
    await admin.agent.post(`/api/cases/admin/${internalId}/archive`).set("origin", integrationConfig.appOrigin).set("x-csrf-token", admin.token).send({ reason: "Archive" }).expect(200);
    integrationDb.close();
    integrationDb = openDatabase(integrationConfig.databasePath);
    integrationApp = createApp({ db: integrationDb, config: integrationConfig });
    await request(integrationApp).get(`/api/cases/public/${publicId}`).expect(404);
    assert.equal(integrationDb.prepare("SELECT admin_status FROM cases WHERE id = ?").get(internalId).admin_status, "ARCHIVED");
    assert.equal(integrationDb.prepare("SELECT COUNT(*) count FROM tips WHERE reference_code = ?").get(tip.body.tip.id).count, 1);
    assert.equal(integrationDb.prepare("SELECT COUNT(*) count FROM case_status_history WHERE case_id = ?").get(internalId).count, 5);
  } finally {
    try { integrationDb?.close(); } catch {}
    if (integrationRoot.startsWith(os.tmpdir())) rmSync(integrationRoot, { recursive: true, force: true });
  }
});

test("encrypted backup validates and restores the admin-managed database", async () => {
  const backupRoot = mkdtempSync(path.join(os.tmpdir(), "find-georgia-backup-"));
  const backupConfig = loadConfig({ env: "development", databasePath: path.join(backupRoot, "live", "database.sqlite"), privateStorageDir: path.join(backupRoot, "live", "private"), publicMediaDir: path.join(backupRoot, "live", "public"), backupDir: path.join(backupRoot, "backups"), signedUrlSecret: "backup-test-signed-url-secret-with-thirty-two-characters", appOrigin: "http://localhost:4173", enableJobs: false });
  const encryptionKey = "backup-test-encryption-key-with-at-least-thirty-two-characters";
  let backupDb = openDatabase(backupConfig.databasePath);
  try {
    await seedDatabase(backupDb, backupConfig); backupDb.close(); backupDb = null;
    const snapshot = await createEncryptedBackup(backupConfig, encryptionKey);
    assert.equal(snapshot.manifest.encrypted, true);
    assert.equal(readFileSync(path.join(snapshot.snapshotDir, "files", "database.sqlite.enc")).includes(Buffer.from("SQLite format 3")), false);
    backupDb = openDatabase(backupConfig.databasePath); backupDb.prepare("UPDATE missing_people SET name_en = 'Mutated' WHERE id = ?").run("20000000-0000-4000-8000-000000000124"); backupDb.close(); backupDb = null;
    assert.equal(restoreEncryptedBackup(backupConfig, snapshot.snapshotDir, encryptionKey).validated, true);
    restoreEncryptedBackup(backupConfig, snapshot.snapshotDir, encryptionKey, { apply: true, confirmation: path.basename(snapshot.snapshotDir) });
    backupDb = openDatabase(backupConfig.databasePath);
    assert.equal(backupDb.prepare("SELECT name_en FROM missing_people WHERE id = ?").get("20000000-0000-4000-8000-000000000124").name_en, "Nino Kalandadze");
    assert.equal(backupDb.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  } finally {
    try { backupDb?.close(); } catch {}
    if (backupRoot.startsWith(os.tmpdir())) rmSync(backupRoot, { recursive: true, force: true });
  }
});
