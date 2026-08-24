import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../server/config.js";
import { MIGRATED_TABLES, assertIdentifier, canonicalRows } from "../server/schema.js";

const config = loadConfig();
const outputPath = path.resolve(process.argv[2] || path.join("var", "migration", `sqlite-export-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
const db = new DatabaseSync(config.databasePath, { readOnly: true });
db.exec("PRAGMA query_only = ON");
const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
if (integrity !== "ok") throw new Error(`SQLite integrity check failed: ${integrity}`);

const tables = {};
for (const table of MIGRATED_TABLES) {
  assertIdentifier(table);
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) continue;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
  const canonical = canonicalRows(rows, columns);
  tables[table] = { columns, rows, count: rows.length, sha256: createHash("sha256").update(JSON.stringify(canonical)).digest("hex") };
}
const exportDocument = {
  format: "find-georgia-sqlite-export-v1",
  createdAt: new Date().toISOString(),
  sourceDatabase: path.basename(config.databasePath),
  integrity,
  tables,
};
const serialized = JSON.stringify(exportDocument);
exportDocument.documentSha256 = createHash("sha256").update(serialized).digest("hex");
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(exportDocument, null, 2), { flag: "wx" });
db.close();
console.log(JSON.stringify({ event: "sqlite_export_completed", outputPath, tableCount: Object.keys(tables).length, rowCount: Object.values(tables).reduce((sum, table) => sum + table.count, 0), documentSha256: exportDocument.documentSha256 }));
