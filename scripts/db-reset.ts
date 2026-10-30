// Full reset: delete the SQLite database, re-apply migrations and re-seed.
import { removeDatabase, applyMigrations } from "./db-tools";
import { execSync } from "node:child_process";

console.log("🗑  Deleting existing database ...");
removeDatabase();

console.log("📦 Applying migrations ...");
applyMigrations();

console.log("🌱 Seeding demo data ...");
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

console.log("\n✅ Database recreated and seeded. Demo login: admin@nexora.demo / demo1234");
