import path from "node:path";
import { loadConfig } from "../server/config.js";
import { restoreEncryptedBackup } from "../server/backup.js";

const config = loadConfig();
const snapshotName = process.argv[2];
if (!snapshotName || path.basename(snapshotName) !== snapshotName) throw new Error("Usage: npm run restore -- snapshot-YYYY-MM-DD...");
const apply = process.argv.includes("--apply");
const result = restoreEncryptedBackup(config, path.join(config.backupDir, snapshotName), process.env.BACKUP_ENCRYPTION_KEY, {
  apply,
  confirmation: process.env.RESTORE_CONFIRM,
});
console.log(JSON.stringify({ event: apply ? "restore_completed" : "restore_validated", snapshotName, recoveryDir: result.recoveryDir || null }));
