import { PrismaClient } from "@/generated/prisma/client";
import { createNodeSqliteAdapterFactory } from "@/lib/sqlite-adapter";

// Prisma singleton (avoids re-opening the DB during dev hot-reload).
// Offline sandbox build: WASM query compiler + node:sqlite driver adapter.
// Production: swap the adapter factory for @prisma/adapter-pg (see DATABASE.md).

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  return new PrismaClient({
    adapter: createNodeSqliteAdapterFactory(url),
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  } as never);
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
