import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";

export const GET = route({ permission: "inventory.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const type = query.get("type");
  const warehouseId = query.get("warehouseId");
  const productId = query.get("productId");

  const where = {
    companyId: session.companyId,
    ...(type && type !== "ALL" ? { type } : {}),
    ...(warehouseId && warehouseId !== "ALL" ? { warehouseId } : {}),
    ...(productId ? { productId } : {}),
    ...(q
      ? {
          OR: [
            { movementNumber: { contains: q } },
            { referenceNumber: { contains: q } },
            { batchNumber: { contains: q } },
            { product: { name: { contains: q } } },
            { product: { sku: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { sku: true, name: true, unit: true } },
        warehouse: { select: { code: true, name: true } },
      },
      skip,
      take,
    }),
    prisma.inventoryMovement.count({ where }),
  ]);

  return okPaginated(items, total, page, pageSize);
});
