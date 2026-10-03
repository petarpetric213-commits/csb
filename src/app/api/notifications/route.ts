import { NextResponse } from "next/server";
import { route, pagination } from "@/server/route";
import prisma from "@/lib/db";

export const GET = route({ permission: "notifications.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query, 20);
  const unreadOnly = query.get("unread") === "1";

  const where = {
    companyId: session.companyId,
    userId: session.user.id,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { companyId: session.companyId, userId: session.user.id, readAt: null } }),
  ]);

  return NextResponse.json({
    data: items,
    meta: { total, page, pageSize, unread, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
  });
});
