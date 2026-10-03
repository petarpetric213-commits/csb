import { route, ok } from "@/server/route";
import prisma from "@/lib/db";

export const POST = route({ permission: "notifications.read" }, async ({ session }) => {
  const result = await prisma.notification.updateMany({
    where: { companyId: session.companyId, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok({ updated: result.count });
});
