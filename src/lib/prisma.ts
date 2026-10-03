// Central Prisma re-export. Every server module imports from here so the
// client location (generated) or engine strategy can change in one place.
import { PrismaClient } from "@/generated/prisma/client";

export { PrismaClient };
export type { Prisma } from "@/generated/prisma/client";
export type PrismaClientType = PrismaClient;
