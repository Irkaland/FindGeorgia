import { loadConfig } from "./config.js";
import { openConfiguredDatabase } from "./db.js";
import { startJobLoop } from "./jobs.js";

const config = loadConfig({ processRole: "worker", enableJobs: true });
const db = await openConfiguredDatabase(config);
const stop = startJobLoop(db, config);
console.log(JSON.stringify({ level: "info", event: "worker_started", environment: config.env, version: config.deployVersion }));

async function shutdown(signal) {
  console.log(JSON.stringify({ level: "info", event: "worker_shutdown", signal }));
  stop();
  await db.close();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
