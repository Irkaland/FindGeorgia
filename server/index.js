import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openConfiguredDatabase } from "./db.js";
import { startJobLoop } from "./jobs.js";
import { seedDatabase } from "./seed.js";

const config = loadConfig();
const db = await openConfiguredDatabase(config);
if (config.env !== "production" || config.allowProductionSeed) await seedDatabase(db, config);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = createApp({ db, config, frontendDir: path.join(projectRoot, "dist", "client") });
const stopJobs = config.enableJobs ? startJobLoop(db, config) : () => {};
const server = app.listen(config.port, () => console.log(JSON.stringify({ level: "info", event: "api_started", port: config.port, environment: config.env })));

function shutdown(signal) {
  console.log(JSON.stringify({ level: "info", event: "shutdown", signal }));
  stopJobs();
  server.close(async () => { await db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
