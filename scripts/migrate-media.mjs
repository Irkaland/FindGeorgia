import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { loadConfig } from "../server/config.js";
import { persistMigratedObject } from "../server/storage.js";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run db:migrate-media -- path/to/sqlite-export.json");
const document = JSON.parse(await readFile(path.resolve(input), "utf8"));
if (document.format !== "find-georgia-sqlite-export-v1") throw new Error("Unsupported migration export");
const config = loadConfig();
if (config.storageProvider !== "s3") throw new Error("Media migration requires STORAGE_PROVIDER=s3");
const sourcePublic = path.resolve(process.env.MIGRATION_SOURCE_PUBLIC_DIR || path.join("var", "storage", "public"));
const sourcePrivate = path.resolve(process.env.MIGRATION_SOURCE_PRIVATE_DIR || path.join("var", "storage", "private"));
const objects = new Map();
for (const row of document.tables.cases?.rows || []) if (row.public_image_storage_key) objects.set(row.public_image_storage_key, "public");
for (const table of ["case_evidence", "tip_attachments"]) for (const row of document.tables[table]?.rows || []) if (row.storage_key) objects.set(row.storage_key, "private");

let migrated = 0;
for (const [key, kind] of objects) {
  const sourceRoot = kind === "public" ? sourcePublic : sourcePrivate;
  const buffer = await readFile(path.join(sourceRoot, path.basename(key)));
  const detected = await fileTypeFromBuffer(buffer);
  await persistMigratedObject(buffer, kind, key, config, detected?.mime || "application/octet-stream");
  migrated += 1;
}
console.log(JSON.stringify({ event: "media_migration_completed", migrated, publicBucket: config.objectStoragePublicBucket, privateBucket: config.objectStoragePrivateBucket }));
