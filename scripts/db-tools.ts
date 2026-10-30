// Shared SQLite database utilities for the setup/migration scripts.
// Pure node:sqlite — no project imports, no aliases (runs under plain tsx).
import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Absolute path of the demo database (env override supported). */
export const DB_PATH = (process.env.DATABASE_URL ?? "file:./prisma/dev.db")
  .replace(/^file:/, "")
  .replace(/^sqlite:/, "")
  .split("?")[0];

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

/** True when the database file exists, has all tables and at least one user
 *  (i.e. the app is usable). Fast enough to run before every dev start. */
export function databaseIsReady(): boolean {
  if (!existsSync(DB_PATH) || DB_PATH === ":memory:") return false;
  try {
    const db = new DatabaseSync(DB_PATH);
    try {
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='User'")
        .get();
      if (!table) return false;
      const row = db.prepare("SELECT COUNT(*) AS n FROM User").get() as { n: number | bigint };
      return Number(row.n) > 0;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

function listMigrations(): { name: string; file: string }[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, file: join(MIGRATIONS_DIR, d.name, "migration.sql") }))
    .filter((m) => existsSync(m.file))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Apply all pending prisma/migrations SQL files. Returns how many ran. */
export function applyMigrations(): number {
  const db = new DatabaseSync(DB_PATH);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    // Bookkeeping table (naming-compatible with `prisma migrate`).
    db.exec(`CREATE TABLE IF NOT EXISTS "_migration" (
      "name" TEXT PRIMARY KEY NOT NULL,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);

    const applied = new Set(
      (db.prepare('SELECT "name" FROM "_migration"').all() as { name: string }[]).map((r) => r.name)
    );
    const pending = listMigrations().filter((m) => !applied.has(m.name));

    for (const migration of pending) {
      const sql = readFileSync(migration.file, "utf8");
      console.log(`  Applying ${migration.name} ...`);
      try {
        db.exec("BEGIN");
        db.exec(sql);
        db.prepare('INSERT INTO "_migration" ("name") VALUES (?)').run(migration.name);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      console.log(`  ✓ ${migration.name} applied`);
    }
    return pending.length;
  } finally {
    db.close();
  }
}

/** Delete the database (plus SQLite sidecar files) so it can be rebuilt. */
export function removeDatabase(): void {
  for (const suffix of ["", "-shm", "-wal", "-journal"]) {
    if (existsSync(DB_PATH + suffix)) rmSync(DB_PATH + suffix);
  }
}
