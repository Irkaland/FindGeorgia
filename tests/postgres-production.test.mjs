import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";
import { openConfiguredDatabase } from "../server/db.js";
import { currentMfa } from "../server/security.js";
import { DEMO_MFA_SECRET, DEMO_PASSWORD, seedDatabase } from "../server/seed.js";

const enabled = process.env.RUN_POSTGRES_TESTS === "true";

test("PostgreSQL production contract: migrations, shared sessions, locking, and append-only audit", { skip: !enabled }, async () => {
  const config = loadConfig({
    env: "test", databaseProvider: "postgres", postgresUrl: process.env.POSTGRES_URL, postgresSsl: false,
    appOrigin: "http://localhost:4173", corsAllowedOrigins: ["http://localhost:4173"], apiBaseUrl: "http://localhost:8787",
    signedUrlSecret: "postgres-test-signed-secret-at-least-thirty-two-characters",
    dataEncryptionKey: "postgres-test-encryption-key-is-separate-and-long",
    botProvider: "development", malwareScanner: "development", exposeDevHelpers: true, enableJobs: false,
  });
  const db = await openConfiguredDatabase(config);
  try {
    await seedDatabase(db, config);
    const appA = createApp({ db, config });
    const appB = createApp({ db, config });
    await request(appA).get("/api/health/ready").expect(200);

    const agent = request.agent(appA);
    const csrf = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
    const login = await agent.post("/api/auth/login").set("origin", config.appOrigin).set("x-csrf-token", csrf)
      .send({ email: "moderator@example.test", password: DEMO_PASSWORD, mfaCode: await currentMfa(DEMO_MFA_SECRET) }).expect(200);
    const cookie = login.headers["set-cookie"].map((value) => value.split(";")[0]).join("; ");
    const sharedSession = await request(appB).get("/api/auth/me").set("cookie", cookie).expect(200);
    assert.equal(sharedSession.body.user.role, "ADMIN");

    const row = await db.prepare("SELECT id FROM cases WHERE public_case_id = 'GEO-00124'").get();
    await agent.post(`/api/cases/admin/${row.id}/unpublish`).set("origin", config.appOrigin).set("x-csrf-token", csrf).send({ reason: "PostgreSQL concurrency test" }).expect(200);
    const before = Number((await db.prepare("SELECT COUNT(*) count FROM case_status_history WHERE case_id = ? AND new_status = 'PUBLISHED'").get(row.id)).count);
    const publish = () => agent.post(`/api/cases/admin/${row.id}/publish`).set("origin", config.appOrigin).set("x-csrf-token", csrf).send({ reason: "Concurrent PostgreSQL publish" });
    const [first, second] = await Promise.all([publish(), publish()]);
    assert.deepEqual([first.status, second.status].sort(), [200, 200]);
    const after = Number((await db.prepare("SELECT COUNT(*) count FROM case_status_history WHERE case_id = ? AND new_status = 'PUBLISHED'").get(row.id)).count);
    assert.equal(after, before + 1);

    const event = await db.prepare("SELECT id FROM audit_events ORDER BY created_at LIMIT 1").get();
    await assert.rejects(db.prepare("UPDATE audit_events SET reason = 'tampered' WHERE id = ?").run(event.id), /append-only/i);
  } finally {
    await db.close();
  }
});
