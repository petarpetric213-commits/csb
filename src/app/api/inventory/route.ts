import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";

/** Stock overview: one row per product (aggregated across warehouses),
 *  with per-warehouse breakdown and reorder flags. */
export const GET = route({ permission: "inventory.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const warehouseId = query.get("warehouseId");
  const filter = query.get("filter"); // low | negative | all

  const products = await prisma.product.findMany({
    where: {
      companyId: session.companyId,
      deletedAt: null,
      isStockTracked: true,
      ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }] } : {}),
    },
    include: {
      category: { select: { name: true } },
      inventoryItems: {
        include: { warehouse: { select: { id: true, code: true, name: true } } },
        ...(warehouseId && warehouseId !== "ALL" ? { where: { warehouseId } } : {}),
      },
    },
    orderBy: { sku: "asc" },
  });

  let rows = products.map((p) => {
    const physical = p.inventoryItems.reduce((s, i) => s + i.physicalQty, 0);
    const reserved = p.inventoryItems.reduce((s, i) => s + i.reservedQty, 0);
    const quarantined = p.inventoryItems.reduce((s, i) => s + i.quarantinedQty, 0);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category?.name ?? null,
      unit: p.unit,
      reorderPoint: p.reorderPoint,
      minStock: p.minStock,
      purchasePrice: p.purchasePrice,
      physical: Math.round(physical * 100) / 100,
      reserved: Math.round(reserved * 100) / 100,
      quarantined: Math.round(quarantined * 100) / 100,
      available: Math.round((physical - reserved) * 100) / 100,
      value: Math.round(physical * p.purchasePrice * 100) / 100,
      low: physical - reserved <= p.reorderPoint,
      belowMin: physical - reserved <= p.minStock,
      warehouses: p.inventoryItems.map((i) => ({
        warehouseId: i.warehouseId,
        warehouse: i.warehouse.code,
        physical: i.physicalQty,
        reserved: i.reservedQty,
        quarantined: i.quarantinedQty,
      })),
    };
  });

  if (filter === "low") rows = rows.filter((r) => r.low);
  if (filter === "negative") rows = rows.filter((r) => r.available < 0);
  if (warehouseId && warehouseId !== "ALL") {
    rows = rows.filter((r) => r.warehouses.length > 0);
  }

  const total = rows.length;
  const paged = rows.slice(skip, skip + take);
  return okPaginated(paged, total, page, pageSize);
});
