import { loadConfig } from "../server/config.js";
import { createEncryptedBackup } from "../server/backup.js";

const config = loadConfig();
const result = await createEncryptedBackup(config, process.env.BACKUP_ENCRYPTION_KEY);
console.log(JSON.stringify({ event: "backup_completed", snapshotDir: result.snapshotDir, fileCount: result.manifest.files.length }));
