import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

export type NotificationType =
  | "LOW_STOCK" | "ORDER_CREATED" | "INVOICE_OVERDUE" | "PO_RECEIVED"
  | "PRODUCTION_DELAY" | "QUALITY_FAIL" | "TASK_ASSIGNED" | "SHIPMENT_DELAYED"
  | "PAYMENT_RECEIVED" | "SYSTEM";

/** Create notifications for specific users. */
export async function notifyUsers(
  tx: Tx,
  p: {
    companyId: string;
    userIds: string[];
    type: NotificationType;
    title: string;
    body?: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    entityType?: string;
    entityId?: string;
  }
) {
  const unique = [...new Set(p.userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await tx.notification.createMany({
    data: unique.map((userId) => ({
      companyId: p.companyId,
      userId,
      type: p.type,
      title: p.title,
      body: p.body ?? null,
      priority: p.priority ?? "NORMAL",
      entityType: p.entityType ?? null,
      entityId: p.entityId ?? null,
    })),
  });
}

/** Notify all users of a company that hold a given permission (e.g. inventory.read). */
export async function notifyPermissionHolders(
  tx: Tx,
  p: {
    companyId: string;
    permission: string;
    type: NotificationType;
    title: string;
    body?: string;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    entityType?: string;
    entityId?: string;
  }
) {
  const holders = await tx.userCompany.findMany({
    where: {
      companyId: p.companyId,
      role: { permissions: { some: { permission: p.permission } } },
    },
    select: { userId: true },
  });
  await notifyUsers(tx, { ...p, userIds: holders.map((h) => h.userId) });
}
