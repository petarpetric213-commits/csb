import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";

export const GET = route({ permission: "logistics.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const q = query.get("q")?.trim();
  const status = query.get("status");

  const where = {
    companyId: session.companyId,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(q
      ? {
          OR: [
            { shipmentNumber: { contains: q } },
            { trackingNumber: { contains: q } },
            { customer: { companyName: { contains: q } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { companyName: true, firstName: true, lastName: true } },
        warehouse: { select: { code: true } },
        salesOrder: { select: { orderNumber: true } },
        _count: { select: { items: true } },
      },
      skip,
      take,
    }),
    prisma.shipment.count({ where }),
  ]);

  return okPaginated(
    items.map((s) => ({
      id: s.id,
      shipmentNumber: s.shipmentNumber,
      orderNumber: s.salesOrder?.orderNumber ?? null,
      customer: s.customer.companyName ?? `${s.customer.firstName ?? ""} ${s.customer.lastName ?? ""}`.trim(),
      status: s.status,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      plannedDate: s.plannedDate,
      actualDate: s.actualDate,
      packageCount: s.packageCount,
      warehouse: s.warehouse?.code ?? null,
      itemCount: s._count.items,
    })),
    total,
    page,
    pageSize
  );
});
