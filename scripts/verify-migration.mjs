import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../server/config.js";
import { openConfiguredDatabase } from "../server/db.js";
import { MIGRATED_TABLES, assertIdentifier, canonicalRows } from "../server/schema.js";

const input = process.argv[2];
if (!input) throw new Error("Usage: npm run db:verify-migration -- path/to/sqlite-export.json");
const document = JSON.parse(await readFile(path.resolve(input), "utf8"));
const config = loadConfig({ databaseProvider: "postgres" });
const db = await openConfiguredDatabase(config);
const results = [];
try {
  for (const table of MIGRATED_TABLES) {
    const expected = document.tables[table];
    if (!expected) continue;
    assertIdentifier(table);
    const rows = await db.prepare(`SELECT ${expected.columns.map(assertIdentifier).join(", ")} FROM ${table} ORDER BY 1`).all();
    const sha256 = createHash("sha256").update(JSON.stringify(canonicalRows(rows, expected.columns))).digest("hex");
    results.push({ table, expectedCount: expected.count, actualCount: rows.length, checksumMatch: sha256 === expected.sha256 });
  }
  const orphans = {
    casesWithoutPeople: Number((await db.prepare("SELECT COUNT(*) count FROM cases c LEFT JOIN missing_people p ON p.id = c.missing_person_id WHERE p.id IS NULL").get()).count),
    tipsWithoutCases: Number((await db.prepare("SELECT COUNT(*) count FROM tips t LEFT JOIN cases c ON c.id = t.case_id WHERE c.id IS NULL").get()).count),
    attachmentsWithoutTips: Number((await db.prepare("SELECT COUNT(*) count FROM tip_attachments a LEFT JOIN tips t ON t.id = a.tip_id WHERE t.id IS NULL").get()).count),
  };
  const failed = results.filter((result) => result.expectedCount !== result.actualCount || !result.checksumMatch);
  if (failed.length || Object.values(orphans).some(Boolean)) throw new Error(`Migration verification failed: ${JSON.stringify({ failed, orphans })}`);
  console.log(JSON.stringify({ event: "postgres_migration_verified", tables: results.length, rows: results.reduce((sum, result) => sum + result.actualCount, 0), orphans }));
} finally {
  await db.close();
}
