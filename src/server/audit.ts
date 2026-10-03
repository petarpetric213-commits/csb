import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

export type AuditInput = {
  companyId: string;
  userId?: string | null;
  action: string; // CREATED | UPDATED | DELETED | STATUS_CHANGED | LOGIN | RECEIVED | SHIPPED | ...
  entityType: string;
  entityId: string;
  entityNumber?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

function serialize(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  try {
    return JSON.stringify(v, (_, val) =>
      val instanceof Date ? val.toISOString() : val
    );
  } catch {
    return null;
  }
}

/**
 * Append an audit record. Always called inside the same transaction as the
 * business change so the log can never diverge from the data.
 */
export async function logAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      companyId: input.companyId,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityNumber: input.entityNumber ?? null,
      summary: input.summary ?? null,
      beforeData: serialize(input.before),
      afterData: serialize(input.after),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
