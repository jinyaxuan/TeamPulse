import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, projects, workItemEvents, workItems } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { env } from "@/lib/env";
import { isAllowedTriageOrigin, parsePersistedJevTriage } from "@/lib/jev";
import {
  ensureVersion,
  publishWorkItemUpdate,
  requireProjectManager,
  requireVisibleWorkItem,
  toWorkItemResponse,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const adoptSchema = z.object({
  version: z.number().int().positive(),
  triageEventId: z.string().uuid(),
  action: z.enum(["priority", "clarify"]),
});

/** Apply one current JEV suggestion by an explicit human project-manager decision. */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  if (ctx.source !== "session" || !isAllowedTriageOrigin(request.headers.get("origin"), env.PUBLIC_APP_URL)) {
    throw new ApiError("只有项目负责人可在网页中采纳 JEV 建议", 403);
  }
  const item = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectManager(item.projectId, ctx.user);
  const body = await parseBody(request, adoptSchema);

  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, item.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(body.version, current.version);

    const [project] = await tx
      .select({ enabled: projects.jevEnabled })
      .from(projects)
      .where(eq(projects.id, current.projectId))
      .for("share")
      .limit(1);
    if (!project?.enabled) throw new ApiError("该项目尚未启用 JEV 分析", 403);

    const triageEvents = await tx
      .select({ id: workItemEvents.id, payload: workItemEvents.payload })
      .from(workItemEvents)
      .where(and(eq(workItemEvents.workItemId, current.id), eq(workItemEvents.eventType, "jev_triaged")))
      .orderBy(desc(workItemEvents.createdAt), desc(workItemEvents.id));
    const latest = triageEvents
      .map((event) => ({ event, parsed: parsePersistedJevTriage(event.payload) }))
      .find((entry) => entry.parsed !== null);
    if (!latest || latest.event.id !== body.triageEventId || latest.parsed?.inputVersion !== current.version) {
      throw new ApiError("JEV 分析已过期，请刷新并重新分析", 409);
    }

    const suggestedPriority = latest.parsed.triage.priority.choice;
    if (body.action === "priority") {
      if (["awaiting_acceptance", "accepted", "cancelled"].includes(current.status)) {
        throw new ApiError("当前阶段不能调整优先级", 409);
      }
      if (current.priority === suggestedPriority) throw new ApiError("当前优先级已与 JEV 建议一致", 409);
    } else if (current.status !== "intake") {
      throw new ApiError("只有待梳理的工作项可以进入澄清阶段", 409);
    }

    const [row] = await tx
      .update(workItems)
      .set({
        ...(body.action === "priority" ? { priority: suggestedPriority } : { status: "clarifying" }),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(workItems.id, current.id), eq(workItems.version, current.version)))
      .returning();
    if (!row) throw new ApiError("工作项已被其他人更新，请刷新后重试", 409);

    await tx.insert(workItemEvents).values({
      workItemId: row.id,
      actorUserId: ctx.user.id,
      eventType: "jev_adopted",
      fromStatus: current.status,
      toStatus: row.status,
      payload: {
        triage_event_id: latest.event.id,
        input_version: latest.parsed.inputVersion,
        model: latest.parsed.triage.model,
        action: body.action,
        before: { priority: current.priority, status: current.status },
        after: { priority: row.priority, status: row.status },
      },
    });
    return row;
  });

  publishWorkItemUpdate({
    projectId: updated.projectId,
    workItemId: updated.id,
    actorUserId: ctx.user.id,
    status: updated.status,
    version: updated.version,
    eventType: "jev_adopted",
  });
  const response = toWorkItemResponse(updated);
  return json({ workItem: response, work_item: response, adoptedAction: body.action });
});
