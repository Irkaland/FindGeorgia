import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const sqliteTransactionLocks = new WeakMap();

export function openDatabase(databasePath) {
  if (databasePath !== ":memory:") mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.dialect = "sqlite";
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name));
  const files = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort() : [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export async function transaction(db, fn) {
  if (db.dialect === "postgres") return db.transaction(fn);
  const previous = sqliteTransactionLocks.get(db) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  sqliteTransactionLocks.set(db, previous.then(() => gate));
  await previous;
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = await fn(db);
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    release();
  }
}

export async function nextCounter(db, name) {
  if (db.dialect === "postgres") {
    const row = await db.prepare("UPDATE counters SET value = value + 1 WHERE name = ? RETURNING value").get(name);
    return Number(row.value);
  }
  db.prepare("UPDATE counters SET value = value + 1 WHERE name = ?").run(name);
  return db.prepare("SELECT value FROM counters WHERE name = ?").get(name).value;
}

export async function openConfiguredDatabase(config) {
  if (config.databaseProvider === "postgres") {
    const { openPostgresDatabase } = await import("./postgres.js");
    return openPostgresDatabase(config);
  }
  return openDatabase(config.databasePath);
}
