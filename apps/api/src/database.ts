import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import pg from "pg";

export type Row = Record<string, unknown>;
export interface Database {
  all<T extends Row = Row>(sql: string, args?: unknown[]): Promise<T[]>;
  run(sql: string, args?: unknown[]): Promise<void>;
  transaction<T>(callback: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
const schema = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS market_references (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, geography TEXT NOT NULL, geography_key TEXT NOT NULL, geography_level TEXT NOT NULL, rent_per_m2 REAL NOT NULL, as_of TEXT NOT NULL, sample_size INTEGER, dispersion REAL, source_label TEXT NOT NULL, usage_terms TEXT NOT NULL, imported_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS market_lookup ON market_references(owner_id,geography_key,as_of)",
  "CREATE TABLE IF NOT EXISTS sale_area_references (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, geography TEXT NOT NULL, geography_key TEXT NOT NULL, geography_level TEXT NOT NULL, sale_price_per_m2 REAL NOT NULL, as_of TEXT NOT NULL, sample_size INTEGER, source_label TEXT NOT NULL, usage_terms TEXT NOT NULL, imported_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS sale_reference_lookup ON sale_area_references(owner_id,geography_key,as_of)",
  "CREATE TABLE IF NOT EXISTS property_comparables (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, listing_key TEXT, geography TEXT NOT NULL, geography_key TEXT NOT NULL, property_type TEXT NOT NULL, price REAL NOT NULL, area REAL NOT NULL, bedrooms INTEGER, observed_at TEXT NOT NULL, source_label TEXT NOT NULL, usage_terms TEXT NOT NULL, imported_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS comparable_lookup ON property_comparables(owner_id,geography_key,property_type,observed_at)",
  "CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS installations (hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS pairing_codes (hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, expires_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS properties (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, canonical_key TEXT NOT NULL, report_id TEXT, favorite INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, UNIQUE(owner_id,canonical_key))",
  "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, input_hash TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, report_id TEXT, error TEXT, created_at TEXT NOT NULL, UNIQUE(owner_id,input_hash))",
  "CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, property_id TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, property_id TEXT NOT NULL, price REAL NOT NULL, observed_at TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS shares (token_hash TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, report_id TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0)",
  "CREATE TABLE IF NOT EXISTS checklist (owner_id TEXT NOT NULL, property_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner_id,property_id))",
  "CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status)",
];

export async function openDatabase(
  options: { url?: string; file?: string } = {},
): Promise<Database> {
  let db: Database;
  if (options.url) {
    const pool = new pg.Pool({ connectionString: options.url, max: 5 });
    const wrap = (client: pg.Pool | pg.PoolClient): Database => ({
      async all<T extends Row>(sql: string, args: unknown[] = []) {
        return (await client.query(sql, args)).rows as T[];
      },
      async run(sql, args = []) {
        await client.query(sql, args);
      },
      async transaction<T>(callback: (db: Database) => Promise<T>) {
        const connection = await pool.connect();
        try {
          await connection.query("BEGIN");
          const result = await callback(wrap(connection));
          await connection.query("COMMIT");
          return result;
        } catch (error) {
          await connection.query("ROLLBACK");
          throw error;
        } finally {
          connection.release();
        }
      },
      async close() {
        await pool.end();
      },
    });
    db = wrap(pool);
  } else {
    const file = options.file || "work/data/fincalens.sqlite";
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    const connection = new DatabaseSync(file);
    connection.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    let queue: Promise<unknown> = Promise.resolve();
    // SQLite's anonymous `?` placeholders consume values in occurrence order.
    // PostgreSQL-style `$n` placeholders can repeat or appear out of order, so
    // expand the argument list to match the actual query rather than forwarding
    // the original array (which silently binds the wrong values).
    const bind = (query: string, args: unknown[]) => ({
      sql: query.replace(/\$(\d+)/g, "?"),
      args: [...query.matchAll(/\$(\d+)/g)].map(
        (match) => args[Number(match[1]) - 1],
      ),
    });
    db = {
      async all<T extends Row>(query: string, args: unknown[] = []) {
        const statement = bind(query, args);
        return connection
          .prepare(statement.sql)
          .all(...(statement.args as (string | number | null)[])) as T[];
      },
      async run(query, args = []) {
        const statement = bind(query, args);
        connection
          .prepare(statement.sql)
          .run(...(statement.args as (string | number | null)[]));
      },
      transaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
        const task = queue.then(async () => {
          connection.exec("BEGIN IMMEDIATE");
          try {
            const value = await callback(db);
            connection.exec("COMMIT");
            return value;
          } catch (error) {
            connection.exec("ROLLBACK");
            throw error;
          }
        });
        queue = task.catch(() => {});
        return task;
      },
      async close() {
        await queue;
        connection.close();
      },
    };
  }
  for (const sql of schema) await db.run(sql);
  try {
    await db.run(
      "ALTER TABLE property_comparables ADD COLUMN listing_key TEXT",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists|duplicate column/i.test(message)) throw error;
  }
  return db;
}
