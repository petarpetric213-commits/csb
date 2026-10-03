import { route, ok } from "@/server/route";
import prisma from "@/lib/db";

/** Platform administration: all companies with usage counters (SUPER_ADMIN). */
export const GET = route({ permission: "admin.read" }, async () => {
  const companies = await prisma.company.findMany({
    include: {
      _count: {
        select: {
          memberships: true, employees: true, customers: true, suppliers: true,
          products: true, salesOrders: true, purchaseOrders: true, invoices: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return ok(
    companies.map((c) => ({
      id: c.id,
      legalName: c.legalName,
      tradingName: c.tradingName,
      city: c.city,
      country: c.country,
      currency: c.currency,
      isDemo: c.isDemo,
      createdAt: c.createdAt,
      counts: c._count,
    }))
  );
});
