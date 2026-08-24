import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../server/config.js";
import { openConfiguredDatabase, transaction } from "../server/db.js";
import { MIGRATED_TABLES, assertIdentifier } from "../server/schema.js";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run db:import-postgres -- path/to/sqlite-export.json");
const document = JSON.parse(await readFile(path.resolve(input), "utf8"));
if (document.format !== "find-georgia-sqlite-export-v1" || document.integrity !== "ok") throw new Error("The export is missing, corrupt, or unsupported");
const config = loadConfig({ databaseProvider: "postgres" });
if (!config.postgresUrl) throw new Error("POSTGRES_URL is required");
const db = await openConfiguredDatabase(config);
try {
  const existing = Number((await db.prepare("SELECT COUNT(*) count FROM users").get()).count);
  if (existing) throw new Error("Target PostgreSQL database already contains users; import requires a fresh migrated database");
  await transaction(db, async (tx) => {
    for (const table of MIGRATED_TABLES) {
      const data = document.tables[table];
      if (!data) continue;
      assertIdentifier(table);
      const columns = data.columns.map(assertIdentifier);
      const placeholders = columns.map(() => "?").join(", ");
      let conflict = "ON CONFLICT DO NOTHING";
      if (table === "counters") conflict = "ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value";
      const statement = tx.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ${conflict}`);
      for (const row of data.rows) await statement.run(...columns.map((column) => row[column]));
    }
  });
  console.log(JSON.stringify({ event: "postgres_import_completed", source: path.resolve(input), tableCount: Object.keys(document.tables).length }));
} finally {
  await db.close();
}
