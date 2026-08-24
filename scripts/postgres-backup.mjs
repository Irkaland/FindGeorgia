import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../server/config.js";

const config = loadConfig();
if (config.databaseProvider !== "postgres" || !config.postgresUrl) throw new Error("PostgreSQL backup requires DATABASE_PROVIDER=postgres and POSTGRES_URL");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = path.resolve(config.backupDir, `postgres-${stamp}`);
const dumpPath = path.join(outputDir, "find-georgia.dump");
await mkdir(outputDir, { recursive: true });
await run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${dumpPath}`], { PGDATABASE: config.postgresUrl });
const dump = await readFile(dumpPath);
const manifest = { format: "find-georgia-postgres-backup-v1", createdAt: new Date().toISOString(), sha256: createHash("sha256").update(dump).digest("hex"), bytes: dump.length };
await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
console.log(JSON.stringify({ event: "postgres_backup_completed", outputDir, bytes: dump.length, sha256: manifest.sha256 }));

function run(command, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"], windowsHide: true, env: { ...process.env, ...environment } });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
