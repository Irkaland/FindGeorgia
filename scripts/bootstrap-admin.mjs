import { timingSafeEqual } from "node:crypto";
import { loadConfig } from "../server/config.js";
import { openConfiguredDatabase, transaction } from "../server/db.js";
import { encryptSensitive, hashPassword, isoNow, opaqueId, sha256 } from "../server/security.js";

const config = loadConfig();
const token = process.env.BOOTSTRAP_TOKEN || "";
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
const mfaSecret = (process.env.BOOTSTRAP_ADMIN_MFA_SECRET || "").replace(/\s/g, "");
if (!config.adminBootstrapTokenHash || !token) throw new Error("ADMIN_BOOTSTRAP_TOKEN_HASH and BOOTSTRAP_TOKEN are required");
const actualHash = sha256(token);
if (actualHash.length !== config.adminBootstrapTokenHash.length || !timingSafeEqual(Buffer.from(actualHash), Buffer.from(config.adminBootstrapTokenHash))) throw new Error("Bootstrap authorization failed");
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address");
if (password.length < 14 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 14 characters with upper/lowercase letters and a number");
if (!/^[A-Z2-7]{32,}$/.test(mfaSecret)) throw new Error("BOOTSTRAP_ADMIN_MFA_SECRET must be a strong base32 TOTP secret");

const db = await openConfiguredDatabase(config);
try {
  const active = Number((await db.prepare(`SELECT COUNT(*) count FROM users u JOIN user_roles ur ON ur.user_id = u.id
    WHERE ur.role_id = 'SUPER_ADMIN' AND u.disabled_at IS NULL`).get()).count);
  if (active) throw new Error("An active super administrator already exists; one-time bootstrap is closed");
  const id = opaqueId();
  const now = isoNow();
  await transaction(db, async (tx) => {
    await tx.prepare(`INSERT INTO users(id, email, password_hash, email_verified_at, mfa_enabled, mfa_secret_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, ?)`)
      .run(id, email, await hashPassword(password), now, encryptSensitive(mfaSecret, config.dataEncryptionKey), now, now);
    await tx.prepare("INSERT INTO user_roles(user_id, role_id, assigned_at) VALUES (?, 'SUPER_ADMIN', ?)").run(id, now);
    await tx.prepare(`INSERT INTO audit_events(id, actor_id, actor_role, action, resource_type, resource_id, reason, created_at)
      VALUES (?, ?, 'SUPER_ADMIN', 'INITIAL_ADMIN_BOOTSTRAPPED', 'USER', ?, 'One-time production bootstrap', ?)`)
      .run(opaqueId(), id, id, now);
  });
  console.log(JSON.stringify({ event: "initial_admin_bootstrapped", userId: id, email }));
} finally {
  await db.close();
}
