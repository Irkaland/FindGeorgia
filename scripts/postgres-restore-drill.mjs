import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../server/config.js";
import { openPostgresDatabase } from "../server/postgres.js";

const snapshotDir = process.argv[2] && path.resolve(process.argv[2]);
const targetUrl = process.env.RESTORE_TARGET_POSTGRES_URL || "";
if (!snapshotDir || !targetUrl) throw new Error("Usage: set RESTORE_TARGET_POSTGRES_URL to a disposable database and run npm run restore:postgres-drill -- path/to/postgres-snapshot");
const live = loadConfig().postgresUrl;
if (targetUrl === live) throw new Error("Restore drill target must not be the live production database");
if (process.env.RESTORE_CONFIRM !== path.basename(snapshotDir)) throw new Error("RESTORE_CONFIRM must exactly match the snapshot directory name");
const manifest = JSON.parse(await readFile(path.join(snapshotDir, "manifest.json"), "utf8"));
const dumpPath = path.join(snapshotDir, "find-georgia.dump");
const dump = await readFile(dumpPath);
if (createHash("sha256").update(dump).digest("hex") !== manifest.sha256) throw new Error("Backup checksum mismatch");
await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-acl", dumpPath], { PGDATABASE: targetUrl });
const config = loadConfig({ env: "development", databaseProvider: "postgres", postgresUrl: targetUrl, postgresSsl: false });
const db = await openPostgresDatabase(config);
try {
  const counts = {};
  for (const table of ["users", "cases", "tips", "audit_events"]) counts[table] = Number((await db.prepare(`SELECT COUNT(*) count FROM ${table}`).get()).count);
  console.log(JSON.stringify({ event: "postgres_restore_drill_completed", snapshotDir, counts }));
} finally { await db.close(); }

function run(command, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"], windowsHide: true, env: { ...process.env, ...environment } });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
