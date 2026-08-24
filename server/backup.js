import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { backup as sqliteBackup, DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openDatabase } from "./db.js";

function keyFromSecret(secret) {
  if (!secret || secret.length < 32) throw new Error("BACKUP_ENCRYPTION_KEY must contain at least 32 characters");
  return createHash("sha256").update(secret).digest();
}

function assertWithin(parent, child) {
  const root = path.resolve(parent);
  const target = path.resolve(child);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe backup path: ${target}`);
  return target;
}

function listFiles(root, prefix) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute, path.join(prefix, entry.name)));
    else if (entry.isFile()) files.push({ absolute, logical: path.join(prefix, entry.name).replaceAll("\\", "/") });
  }
  return files;
}

function encryptFile(source, destination, key) {
  const plain = readFileSync(source);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, encrypted, { flag: "wx" });
  return {
    bytes: plain.length,
    sha256: createHash("sha256").update(plain).digest("hex"),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

function manifestPayload(manifest) {
  return JSON.stringify({ version: manifest.version, createdAt: manifest.createdAt, files: manifest.files });
}

export async function createEncryptedBackup(config, encryptionSecret, { timestamp = new Date() } = {}) {
  const key = keyFromSecret(encryptionSecret);
  mkdirSync(config.backupDir, { recursive: true });
  const stamp = timestamp.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const snapshotDir = assertWithin(config.backupDir, path.join(config.backupDir, `snapshot-${stamp}`));
  const tempDir = assertWithin(config.backupDir, path.join(config.backupDir, `.backup-${randomUUID()}`));
  mkdirSync(snapshotDir, { recursive: false });
  mkdirSync(tempDir, { recursive: false });
  const databaseSnapshot = path.join(tempDir, "database.sqlite");
  const db = openDatabase(config.databasePath);
  try { await sqliteBackup(db, databaseSnapshot); } finally { db.close(); }

  try {
    const sources = [
      { absolute: databaseSnapshot, logical: "database.sqlite" },
      ...listFiles(config.privateStorageDir, "private"),
      ...listFiles(config.publicMediaDir, "public"),
    ];
    const files = sources.map(({ absolute, logical }) => {
      const encryptedPath = path.join(snapshotDir, "files", `${logical}.enc`);
      return { path: logical, ...encryptFile(absolute, encryptedPath, key) };
    });
    const manifest = { version: 1, createdAt: timestamp.toISOString(), encrypted: true, algorithm: "AES-256-GCM", files };
    manifest.signature = createHmac("sha256", key).update(manifestPayload(manifest)).digest("base64url");
    writeFileSync(path.join(snapshotDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    return { snapshotDir, manifest };
  } catch (error) {
    rmSync(snapshotDir, { recursive: true, force: true });
    throw error;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function decryptSnapshot(snapshotDir, destination, encryptionSecret) {
  const key = keyFromSecret(encryptionSecret);
  const manifest = JSON.parse(readFileSync(path.join(snapshotDir, "manifest.json"), "utf8"));
  const expected = createHmac("sha256", key).update(manifestPayload(manifest)).digest("base64url");
  const actual = manifest.signature || "";
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new Error("Backup manifest authentication failed");
  for (const file of manifest.files) {
    const source = assertWithin(snapshotDir, path.join(snapshotDir, "files", `${file.path}.enc`));
    const output = assertWithin(destination, path.join(destination, file.path));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(file.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(file.tag, "base64url"));
    const plain = Buffer.concat([decipher.update(readFileSync(source)), decipher.final()]);
    if (plain.length !== file.bytes || createHash("sha256").update(plain).digest("hex") !== file.sha256) throw new Error(`Backup integrity check failed for ${file.path}`);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, plain, { flag: "wx" });
  }
  const validationDb = new DatabaseSync(path.join(destination, "database.sqlite"), { readOnly: true });
  try {
    const result = validationDb.prepare("PRAGMA integrity_check").get();
    if (result.integrity_check !== "ok") throw new Error(`SQLite integrity check failed: ${result.integrity_check}`);
  } finally { validationDb.close(); }
  return manifest;
}

export function restoreEncryptedBackup(config, snapshotDir, encryptionSecret, { apply = false, confirmation } = {}) {
  const resolvedSnapshot = assertWithin(config.backupDir, snapshotDir);
  const expectedConfirmation = path.basename(resolvedSnapshot);
  const staging = assertWithin(config.backupDir, path.join(config.backupDir, `.restore-${randomUUID()}`));
  mkdirSync(staging, { recursive: false });
  try {
    const manifest = decryptSnapshot(resolvedSnapshot, staging, encryptionSecret);
    if (!apply) return { validated: true, applied: false, manifest };
    if (confirmation !== expectedConfirmation) throw new Error(`Set RESTORE_CONFIRM=${expectedConfirmation} to apply this restore`);

    const recovery = assertWithin(config.backupDir, path.join(config.backupDir, `pre-restore-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`));
    mkdirSync(recovery, { recursive: false });
    if (existsSync(config.databasePath)) { mkdirSync(path.dirname(path.join(recovery, "database.sqlite")), { recursive: true }); renameSync(config.databasePath, path.join(recovery, "database.sqlite")); }
    if (existsSync(config.privateStorageDir)) renameSync(config.privateStorageDir, path.join(recovery, "private"));
    if (existsSync(config.publicMediaDir)) renameSync(config.publicMediaDir, path.join(recovery, "public"));

    mkdirSync(path.dirname(config.databasePath), { recursive: true });
    renameSync(path.join(staging, "database.sqlite"), config.databasePath);
    if (existsSync(path.join(staging, "private"))) { mkdirSync(path.dirname(config.privateStorageDir), { recursive: true }); renameSync(path.join(staging, "private"), config.privateStorageDir); }
    if (existsSync(path.join(staging, "public"))) { mkdirSync(path.dirname(config.publicMediaDir), { recursive: true }); renameSync(path.join(staging, "public"), config.publicMediaDir); }
    return { validated: true, applied: true, recoveryDir: recovery, manifest };
  } finally {
    if (existsSync(staging) && statSync(staging).isDirectory()) rmSync(staging, { recursive: true, force: true });
  }
}
