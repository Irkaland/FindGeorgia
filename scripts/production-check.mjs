import { loadConfig } from "../server/config.js";
import { openConfiguredDatabase } from "../server/db.js";
import { checkStorage, scanUpload } from "../server/storage.js";

const config = loadConfig({ env: "production" });
const db = await openConfiguredDatabase(config);
try {
  await db.ping();
  const migrations = await db.prepare("SELECT name, applied_at FROM schema_migrations ORDER BY name").all();
  const trigger = await db.prepare("SELECT COUNT(*) count FROM pg_trigger WHERE tgname IN ('prevent_audit_update','prevent_audit_delete') AND NOT tgisinternal").get();
  if (Number(trigger.count) !== 2) throw new Error("Append-only audit triggers are missing");
  const storage = await checkStorage(config);
  const scanner = await scanUpload(Buffer.from("Find Georgia production scanner health check"), config);
  console.log(JSON.stringify({ event: "production_dependencies_ready", database: "postgres", migrationCount: migrations.length, auditTriggers: Number(trigger.count), storage, scanner: scanner.status, email: config.emailProvider, bot: config.botProvider, monitoring: Boolean(config.errorMonitorDsn) }));
} finally {
  await db.close();
}
