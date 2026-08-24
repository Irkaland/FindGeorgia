import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations", "postgres");

function postgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`).replace(/INSERT\s+OR\s+IGNORE/gi, "INSERT");
}

class PostgresStatement {
  constructor(queryable, sql) {
    this.queryable = queryable;
    this.sql = postgresSql(sql);
  }

  async run(...params) {
    const result = await this.queryable.query(this.sql, params);
    return { changes: result.rowCount, rows: result.rows };
  }

  async get(...params) {
    const result = await this.queryable.query(this.sql, params);
    return result.rows[0];
  }

  async all(...params) {
    return (await this.queryable.query(this.sql, params)).rows;
  }
}

export class PostgresDatabase {
  constructor(pool, queryable = pool) {
    this.pool = pool;
    this.queryable = queryable;
    this.dialect = "postgres";
  }

  prepare(sql) { return new PostgresStatement(this.queryable, sql); }
  async exec(sql) { return this.queryable.query(sql); }
  async ping() { await this.queryable.query("SELECT 1"); }
  async close() { if (this.queryable === this.pool) await this.pool.end(); }

  async transaction(fn) {
    const client = await this.pool.connect();
    const tx = new PostgresDatabase(this.pool, client);
    try {
      await client.query("BEGIN");
      const result = await fn(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function openPostgresDatabase(config) {
  const pool = new pg.Pool({
    connectionString: config.postgresUrl,
    max: config.databasePoolMax,
    idleTimeoutMillis: config.databaseIdleTimeoutMs,
    connectionTimeoutMillis: config.databaseConnectTimeoutMs,
    ssl: config.postgresSsl ? { rejectUnauthorized: config.postgresSslRejectUnauthorized } : false,
    application_name: "find-georgia-api",
  });
  pool.on("error", (error) => console.error(JSON.stringify({ level: "error", event: "postgres_pool_error", message: error.message })));
  const db = new PostgresDatabase(pool);
  await db.ping();
  await migratePostgres(db);
  return db;
}

export async function migratePostgres(db) {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set((await db.prepare("SELECT name FROM schema_migrations").all()).map((row) => row.name));
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.prepare("INSERT INTO schema_migrations(name, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
    });
  }
}
