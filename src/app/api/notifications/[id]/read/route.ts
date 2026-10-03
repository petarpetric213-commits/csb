import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { ApiError } from "@/server/errors";

export const POST = route({ permission: "notifications.read" }, async ({ params, session }) => {
  const notification = await prisma.notification.findFirst({
    where: { id: params.id, userId: session.user.id },
  });
  if (!notification) throw ApiError.notFound("Notification not found.");
  if (!notification.readAt) {
    await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
  }
  return ok({ id: notification.id, read: true });
});
