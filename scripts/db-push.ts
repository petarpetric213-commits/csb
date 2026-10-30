// Apply prisma/migrations SQL to the SQLite database via node:sqlite.
// (Offline-friendly replacement for `prisma db push`, which needs Prisma's
// native schema engine binary. For PostgreSQL deployments use `prisma db push`.)
import { applyMigrations, DB_PATH } from "./db-tools";

if (!DB_PATH || DB_PATH === ":memory:") {
  console.error("Refusing to push to :memory:. Set DATABASE_URL.");
  process.exit(1);
}

const applied = applyMigrations();
if (applied === 0) {
  console.log("Database is up to date. No pending migrations.");
} else {
  console.log(`Done. ${applied} migration(s) applied → ${DB_PATH}`);
}
