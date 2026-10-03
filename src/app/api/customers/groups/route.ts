import { route, ok } from "@/server/route";
import prisma from "@/lib/db";

/** Customer groups (flat list for select inputs). */
export const GET = route({ permission: "customers.read" }, async ({ session }) => {
  const groups = await prisma.customerGroup.findMany({
    where: { companyId: session.companyId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, discountPercent: true },
  });
  return ok(groups);
});
