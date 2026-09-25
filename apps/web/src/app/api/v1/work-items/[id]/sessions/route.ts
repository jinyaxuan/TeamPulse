import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, tasks, workItemEvents, workItems, workItemSessions } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import {
  ensureVersion,
  publishWorkItemUpdate,
  requireProjectManager,
  requireProjectWrite,
  requireVisibleWorkItem,
  toWorkItemResponse,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const linkSchema = z.object({
  version: z.number().int().positive(),
  task_id: z.string().uuid(),
});

/** Link an existing Agent execution session to durable work evidence. */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const existing = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectWrite(existing.projectId, ctx.user);
  const body = await parseBody(request, linkSchema);

  const [task] = await db.select().from(tasks).where(eq(tasks.id, body.task_id)).limit(1);
  if (!task || task.projectId !== existing.projectId) {
    throw new ApiError("执行会话不存在或不属于该项目", 404);
  }
  if (task.status === "abandoned") throw new ApiError("不能关联已中断的执行会话", 400);
  if (task.userId !== ctx.user.id && ctx.user.role !== "admin") {
    await requireProjectManager(existing.projectId, ctx.user);
  }

  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, existing.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(body.version, current.version);
    if (["accepted", "cancelled", "awaiting_acceptance"].includes(current.status)) {
      throw new ApiError("当前阶段不能新增执行会话", 409);
    }

    const [linked] = await tx
      .select()
      .from(workItemSessions)
      .where(and(eq(workItemSessions.workItemId, current.id), eq(workItemSessions.taskId, task.id)))
      .limit(1);
    if (linked) throw new ApiError("该执行会话已经关联", 409);

    await tx.insert(workItemSessions).values({
      workItemId: current.id,
      taskId: task.id,
      linkedBy: ctx.user.id,
    });
    const nextStatus = current.status === "assigned" ? "in_progress" : current.status;
    const [updated] = await tx
      .update(workItems)
      .set({ status: nextStatus, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(workItems.id, current.id), eq(workItems.version, current.version)))
      .returning();
    if (!updated) throw new ApiError("工作项已被其他人更新，请刷新后重试", 409);

    await tx.insert(workItemEvents).values({
      workItemId: current.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: "session_linked",
      fromStatus: current.status,
      toStatus: nextStatus,
      payload: { task_id: task.id, task_status: task.status, session_id: task.sessionId },
    });
    return { item: updated, task };
  });

  const response = toWorkItemResponse(result.item);
  publishWorkItemUpdate({
    projectId: result.item.projectId,
    workItemId: result.item.id,
    actorUserId: ctx.user.id,
    status: result.item.status,
    version: result.item.version,
    eventType: "session_linked",
  });
  return json({
    workItem: response,
    work_item: response,
    session: {
      id: result.task.id,
      task_id: result.task.id,
      taskId: result.task.id,
      session_id: result.task.sessionId,
      status: result.task.status,
      intent: result.task.intent,
    },
  }, { status: 201 });
});
