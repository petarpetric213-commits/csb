import { route, okPaginated, pagination } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { notifyUsers } from "@/server/services/notifications";
import { z } from "zod";

export const GET = route({ permission: "tasks.read" }, async ({ session, query }) => {
  const { page, pageSize, skip, take } = pagination(query);
  const status = query.get("status");
  const mine = query.get("mine") === "1";
  const q = query.get("q")?.trim();

  const where = {
    companyId: session.companyId,
    ...(status && status !== "ALL" ? { status } : {}),
    ...(mine ? { assigneeId: session.user.id } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [{ completedAt: "asc" }, { dueDate: "asc" }],
      include: {
        assignee: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
      skip,
      take,
    }),
    prisma.task.count({ where }),
  ]);
  return okPaginated(items, total, page, pageSize);
});

const createSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(2000).optional().or(z.literal("")),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  relatedEntityType: z.string().max(60).optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
});

export const POST = route({ permission: "tasks.create", schema: createSchema }, async ({ body, session }) => {
  const task = await prisma.task.create({
    data: {
      companyId: session.companyId,
      title: body.title,
      description: body.description || null,
      priority: body.priority,
      assigneeId: body.assigneeId || null,
      createdById: session.user.id,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      relatedEntityType: body.relatedEntityType || null,
      relatedEntityId: body.relatedEntityId || null,
    },
  });
  if (body.assigneeId && body.assigneeId !== session.user.id) {
    await notifyUsers(prisma, {
      companyId: session.companyId,
      userIds: [body.assigneeId],
      type: "TASK_ASSIGNED",
      title: `New task: ${task.title}`,
      body: task.description ?? undefined,
      priority: task.priority as "LOW" | "NORMAL" | "HIGH" | "URGENT",
      entityType: "Task",
      entityId: task.id,
    });
  }
  await logAudit(prisma, {
    companyId: session.companyId, userId: session.user.id, action: "CREATED",
    entityType: "Task", entityId: task.id,
    summary: `Created task "${task.title}"`,
  });
  return Response.json({ data: task }, { status: 201 });
});
