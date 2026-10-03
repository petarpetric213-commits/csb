import prisma from "@/lib/db";
import type { Prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Atomic document numbering: <PREFIX>-<YEAR>-<00001>
 * Uses a counter row in Setting (upsert) inside the caller's transaction.
 */
export async function nextNumber(
  tx: Tx,
  companyId: string,
  prefix: string,
  date: Date = new Date()
): Promise<string> {
  const year = date.getUTCFullYear();
  const key = `seq:${prefix}:${year}`;
  const setting = await tx.setting.findUnique({
    where: { companyId_key: { companyId, key } },
  });
  const next = setting ? parseInt(setting.value, 10) + 1 : 1;
  if (setting) {
    await tx.setting.update({ where: { id: setting.id }, data: { value: String(next) } });
  } else {
    await tx.setting.create({ data: { companyId, key, value: String(next) } });
  }
  return `${prefix}-${year}-${String(next).padStart(5, "0")}`;
}
