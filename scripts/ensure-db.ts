// Idempotent first-run setup: creates the database (migrations) and seeds
// demo data when needed. Runs automatically before `npm run dev` / `npm start`
// (see the `predev`/`prestart` hooks in package.json), so a fresh clone works
// out of the box:  npm install → npm run dev.
import { databaseIsReady, applyMigrations } from "./db-tools";
import { execSync } from "node:child_process";

async function main() {
  if (databaseIsReady()) {
    // Nothing to do — stay silent so every dev start stays fast.
    return;
  }

  console.log("");
  console.log("  ⚙️  First run detected — setting up the demo database ...");
  console.log("      (this happens only once; afterwards startup is instant)");
  console.log("");

  applyMigrations();

  console.log("  🌱 Seeding demo data (6-month business simulation) ...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

  console.log("");
  console.log("  ✅ Database ready. Demo login: admin@nexora.demo / demo1234");
  console.log("");
}

main().catch((e) => {
  console.error("Database setup failed:", e);
  process.exit(1);
});
