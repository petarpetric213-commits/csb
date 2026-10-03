import { route, ok } from "@/server/route";
import prisma from "@/lib/db";
import { logAudit } from "@/server/audit";
import { ApiError } from "@/server/errors";
import { z } from "zod";

const TASK_TRANSITIONS: Record<string, Record<string, string>> = {
  start: { TODO: "IN_PROGRESS", WAITING: "IN_PROGRESS" },
  complete: { TODO: "COMPLETED", IN_PROGRESS: "COMPLETED", WAITING: "COMPLETED" },
  reopen: { COMPLETED: "TODO", CANCELLED: "TODO" },
  wait: { TODO: "WAITING", IN_PROGRESS: "WAITING" },
};

const patchSchema = z.object({
  action: z.enum(["start", "complete", "reopen", "wait"]).optional(),
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export const PATCH = route({ permission: "tasks.update", schema: patchSchema }, async ({ params, body, session }) => {
  const task = await prisma.task.findFirst({ where: { id: params.id, companyId: session.companyId } });
  if (!task) throw ApiError.notFound("Task not found.");

  const data: Record<string, unknown> = {};
  if (body.action) {
    const to = TASK_TRANSITIONS[body.action]?.[task.status];
    if (!to) throw ApiError.conflict(`Action "${body.action}" is not allowed while the task is ${task.status.replace(/_/g, " ").toLowerCase()}.`);
    data.status = to;
    if (to === "COMPLETED") data.completedAt = new Date();
    else data.completedAt = null;
  }
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const updated = await prisma.task.update({ where: { id: task.id }, data });
  await logAudit(prisma, {
    companyId: session.companyId,
    userId: session.user.id,
    action: body.action ? "STATUS_CHANGED" : "UPDATED",
    entityType: "Task",
    entityId: task.id,
    summary: body.action ? `Task "${task.title}": ${task.status} → ${updated.status}` : `Updated task "${task.title}"`,
    before: { status: task.status },
    after: { status: updated.status },
  });
  return ok(updated);
});
