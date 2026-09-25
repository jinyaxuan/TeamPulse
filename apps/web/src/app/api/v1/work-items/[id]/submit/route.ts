import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, tasks, workItemEvents, workItems, workItemSessions } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { isHttpEvidenceUrl } from "@/lib/work-item-state";
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

const submitSchema = z.object({
  version: z.number().int().positive(),
  summary: z.string().trim().min(1).max(2000),
  evidence: z
    .array(
      z.object({
        kind: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(200),
        content: z.string().trim().max(5000).optional().nullable(),
        url: z.string().url().max(2000).refine(isHttpEvidenceUrl, "证据链接仅支持 http/https").optional().nullable(),
      })
    )
    .max(20)
    .default([]),
});

/** Submit execution evidence for independent human/Agent acceptance. */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const existing = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectWrite(existing.projectId, ctx.user);
  const body = await parseBody(request, submitSchema);

  if (!["in_progress", "rejected"].includes(existing.status)) {
    throw new ApiError("只有执行中或返工中的工作项可以提交验收", 409);
  }
  if (
    existing.assigneeUserId &&
    existing.assigneeUserId !== ctx.user.id &&
    ctx.user.role !== "admin"
  ) {
    await requireProjectManager(existing.projectId, ctx.user);
  }

  const submitted = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, existing.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(body.version, current.version);
    if (current.acceptanceCriteria.length === 0) {
      throw new ApiError("提交验收前请先填写验收标准", 400);
    }

    const linked = await tx
      .select({ id: tasks.id, status: tasks.status, summary: tasks.summary })
      .from(workItemSessions)
      .innerJoin(tasks, eq(workItemSessions.taskId, tasks.id))
      .where(eq(workItemSessions.workItemId, current.id));
    const completed = linked.filter((task) => task.status === "done");
    if (completed.length === 0) {
      throw new ApiError("提交验收前至少需要一条已完成的执行会话", 400);
    }

    const [updated] = await tx
      .update(workItems)
      .set({
        status: "awaiting_acceptance",
        submittedAt: new Date(),
        updatedAt: new Date(),
        version: current.version + 1,
        submissionAttempt: current.submissionAttempt + 1,
      })
      .where(and(eq(workItems.id, current.id), eq(workItems.version, current.version)))
      .returning();
    if (!updated) throw new ApiError("工作项已被其他人更新，请刷新后重试", 409);

    await tx.insert(workItemEvents).values({
      workItemId: current.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: "submitted",
      fromStatus: current.status,
      toStatus: "awaiting_acceptance",
      payload: {
        summary: body.summary,
        evidence: body.evidence,
        task_ids: completed.map((task) => task.id),
        submission_attempt: updated.submissionAttempt,
      },
    });
    return updated;
  });

  const response = toWorkItemResponse(submitted);
  publishWorkItemUpdate({
    projectId: submitted.projectId,
    workItemId: submitted.id,
    actorUserId: ctx.user.id,
    status: submitted.status,
    version: submitted.version,
    eventType: "submitted",
  });
  return json({ workItem: response, work_item: response });
});
