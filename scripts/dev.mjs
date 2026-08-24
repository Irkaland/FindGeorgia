import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const api = spawn(process.execPath, [path.join(root, "server", "index.js")], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "development" } });
const ui = spawn(process.execPath, [path.join(root, "node_modules", "vite", "bin", "vite.js"), "preview", "--configLoader", "runner", "--port", "4173"], { cwd: root, stdio: "inherit", env: process.env });

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  api.kill(signal);
  ui.kill(signal);
  setTimeout(() => process.exit(0), 1000).unref();
}
api.on("exit", (code) => { if (!shuttingDown && code) { ui.kill(); process.exit(code); } });
ui.on("exit", (code) => { if (!shuttingDown && code) { api.kill(); process.exit(code); } });
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
