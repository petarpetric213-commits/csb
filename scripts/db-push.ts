// Apply prisma/migrations SQL to the SQLite database via node:sqlite.
// (Offline replacement for `prisma db push`, which needs Prisma's native
// schema engine binary. For PostgreSQL deployments use `prisma db push`.)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "prisma", "migrations");
const dbPath = (process.env.DATABASE_URL ?? "file:./prisma/dev.db")
  .replace(/^file:/, "")
  .replace(/^sqlite:/, "")
  .split("?")[0];

if (!dbPath || dbPath === ":memory:") {
  console.error("Refusing to push to :memory:. Set DATABASE_URL.");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

// Simple migrations bookkeeping table (compatible with prisma migrate naming).
db.exec(`CREATE TABLE IF NOT EXISTS "_migration" (
  "name" TEXT PRIMARY KEY NOT NULL,
  "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);`);

function listMigrationDirs(): { name: string; file: string }[] {
  const fs = require("node:fs") as typeof import("node:fs");
  if (!existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ name: d.name, file: join(migrationsDir, d.name, "migration.sql") }))
    .filter((m) => existsSync(m.file))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const applied = new Set(
  (db.prepare('SELECT "name" FROM "_migration"').all() as { name: string }[]).map((r) => r.name)
);

const pending = listMigrationDirs().filter((m) => !applied.has(m.name));
if (pending.length === 0) {
  console.log("Database is up to date. No pending migrations.");
  process.exit(0);
}

for (const migration of pending) {
  const sql = readFileSync(migration.file, "utf8");
  console.log(`Applying ${migration.name} ...`);
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

const tables = db.prepare(
  "SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migration'"
).get() as { c: number };
console.log(`Done. ${pending.length} migration(s) applied. Database has ${tables.c} tables.`);
