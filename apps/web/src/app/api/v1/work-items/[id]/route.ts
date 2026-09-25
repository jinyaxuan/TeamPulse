import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  acceptanceReviews,
  db,
  devices,
  knowledgeRecords,
  tasks,
  users,
  workItemEvents,
  workItems,
  workItemSessions,
} from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import {
  assertValidParent,
  canTransition,
  ensureVersion,
  requireProjectManager,
  requireProjectMember,
  requireProjectWrite,
  requireVisibleWorkItem,
  resolveWorkItemAssignee,
  resolveWorkItemReviewer,
  publishWorkItemUpdate,
  REVIEW_POLICIES,
  statusAfterAssignment,
  toWorkItemResponse,
  WORK_ITEM_STATUSES,
} from "@/lib/work-items";
import { canManageProjectMembers } from "@/lib/project-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  version: z.number().int().positive(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(10000).optional().nullable(),
  acceptance_criteria: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  review_policy: z.enum(REVIEW_POLICIES).optional(),
  acceptance_policy: z.enum(REVIEW_POLICIES).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  due_at: z.string().datetime().optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  status: z.enum(WORK_ITEM_STATUSES).optional(),
  stage: z.enum(WORK_ITEM_STATUSES).optional(),
  assignee_user_id: z.string().uuid().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  assignee_device_id: z.string().uuid().optional().nullable(),
  reviewer_user_id: z.string().uuid().optional().nullable(),
  reviewer_id: z.string().uuid().optional().nullable(),
  reviewer_device_id: z.string().uuid().optional().nullable(),
});

/** Fetch a work item and its execution, review, and audit evidence. */
export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const item = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectMember(item.projectId, ctx.user);
  const canSeeDraftKnowledge = await canManageProjectMembers(item.projectId, ctx.user);
  const actor = alias(users, "work_item_event_actor");
  const reviewer = alias(users, "acceptance_reviewer");
  const sessionUser = alias(users, "work_item_session_user");
  const assigneeUser = alias(users, "work_item_assignee_detail");
  const assigneeDevice = alias(devices, "work_item_assignee_device");
  const reviewerUser = alias(users, "work_item_reviewer_detail");

  const [assignmentRows, sessionRows, eventRows, reviewRows, knowledgeRows] = await Promise.all([
    db
      .select({
        assignee_name: assigneeUser.name,
        assignee_display_name: assigneeUser.displayName,
        agent_name: assigneeDevice.agentName,
        reviewer_name: reviewerUser.name,
        reviewer_display_name: reviewerUser.displayName,
      })
      .from(workItems)
      .leftJoin(assigneeUser, eq(workItems.assigneeUserId, assigneeUser.id))
      .leftJoin(assigneeDevice, eq(workItems.assigneeDeviceId, assigneeDevice.id))
      .leftJoin(reviewerUser, eq(workItems.reviewerUserId, reviewerUser.id))
      .where(eq(workItems.id, item.id))
      .limit(1),
    db
      .select({
        id: workItemSessions.taskId,
        task_id: tasks.id,
        user_id: tasks.userId,
        user_name: sessionUser.name,
        user_display_name: sessionUser.displayName,
        intent: tasks.intent,
        status: tasks.status,
        branch: tasks.branch,
        files_touched: tasks.filesTouched,
        summary: tasks.summary,
        started_at: tasks.startedAt,
        ended_at: tasks.endedAt,
        heartbeat_at: tasks.heartbeatAt,
      })
      .from(workItemSessions)
      .innerJoin(tasks, eq(workItemSessions.taskId, tasks.id))
      .leftJoin(sessionUser, eq(tasks.userId, sessionUser.id))
      .where(eq(workItemSessions.workItemId, item.id))
      .orderBy(desc(workItemSessions.createdAt)),
    db
      .select({
        id: workItemEvents.id,
        event_type: workItemEvents.eventType,
        from_status: workItemEvents.fromStatus,
        to_status: workItemEvents.toStatus,
        payload: workItemEvents.payload,
        actor_id: workItemEvents.actorUserId,
        actor_name: actor.name,
        actor_display_name: actor.displayName,
        created_at: workItemEvents.createdAt,
      })
      .from(workItemEvents)
      .leftJoin(actor, eq(workItemEvents.actorUserId, actor.id))
      .where(eq(workItemEvents.workItemId, item.id))
      .orderBy(asc(workItemEvents.createdAt)),
    db
      .select({
        id: acceptanceReviews.id,
        reviewer_type: acceptanceReviews.reviewerKind,
        reviewer_id: acceptanceReviews.reviewerUserId,
        reviewer_name: reviewer.name,
        decision: acceptanceReviews.decision,
        submission_attempt: acceptanceReviews.submissionAttempt,
        note: acceptanceReviews.comment,
        criterion_results: acceptanceReviews.criterionResults,
        created_at: acceptanceReviews.createdAt,
      })
      .from(acceptanceReviews)
      .leftJoin(reviewer, eq(acceptanceReviews.reviewerUserId, reviewer.id))
      .where(eq(acceptanceReviews.workItemId, item.id))
      .orderBy(desc(acceptanceReviews.createdAt)),
    db
      .select()
      .from(knowledgeRecords)
      .where(eq(knowledgeRecords.workItemId, item.id))
      .orderBy(desc(knowledgeRecords.createdAt)),
  ]);

  const sessions = sessionRows.map((row) => ({
    ...row,
    taskId: row.task_id,
    userId: row.user_id,
    userName: row.user_display_name ?? row.user_name,
    agentName: null,
    filesTouched: row.files_touched,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    heartbeatAt: row.heartbeat_at,
  }));
  const reviews = reviewRows.map((row) => ({
    ...row,
    reviewerType: row.reviewer_type,
    submissionAttempt: row.submission_attempt,
    reviewerName: row.reviewer_name,
    createdAt: row.created_at,
  }));
  const audit = eventRows.map((row) => ({
    id: row.id,
    action: row.event_type,
    actorName: row.actor_display_name ?? row.actor_name,
    detail: JSON.stringify(row.payload),
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    payload: row.payload,
    createdAt: row.created_at,
  }));
  const evidence = eventRows
    .filter((event) => event.event_type === "submitted")
    .flatMap((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : {};
      const entries = Array.isArray(payload.evidence) ? payload.evidence : [];
      if (entries.length === 0) {
        return [{
          id: event.id,
          kind: "submission",
          label: "提交说明",
          content: typeof payload.summary === "string" ? payload.summary : null,
          createdAt: event.created_at,
          createdBy: event.actor_id,
        }];
      }
      return entries.map((entry, index) => {
        const evidenceEntry = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        return {
          id: `${event.id}:${index}`,
          kind: typeof evidenceEntry.kind === "string" ? evidenceEntry.kind : "note",
          label: typeof evidenceEntry.label === "string" ? evidenceEntry.label : "执行证据",
          content: typeof evidenceEntry.content === "string" ? evidenceEntry.content : null,
          url: typeof evidenceEntry.url === "string" ? evidenceEntry.url : null,
          createdAt: event.created_at,
          createdBy: event.actor_id,
        };
      });
    });
  const knowledge = knowledgeRows.filter((record) =>
    record.status === "published" || record.createdBy === ctx.user.id || canSeeDraftKnowledge
  ).map((record) => ({
    id: record.id,
    title: record.title,
    content: record.content,
    summary: record.summary,
    source: "work_item",
    status: record.status,
    sourceEventIds: record.sourceEventIds,
    createdAt: record.createdAt,
    createdBy: record.publishedBy,
    created_by: record.createdBy,
  }));
  const response = {
    ...toWorkItemResponse(item),
    assignee_name: assignmentRows[0]?.assignee_display_name ?? assignmentRows[0]?.assignee_name ?? null,
    assigneeName: assignmentRows[0]?.assignee_display_name ?? assignmentRows[0]?.assignee_name ?? null,
    agent_name: assignmentRows[0]?.agent_name ?? null,
    agentName: assignmentRows[0]?.agent_name ?? null,
    reviewer_name: assignmentRows[0]?.reviewer_display_name ?? assignmentRows[0]?.reviewer_name ?? null,
    reviewerName: assignmentRows[0]?.reviewer_display_name ?? assignmentRows[0]?.reviewer_name ?? null,
    sessions,
    executionSessions: sessions,
    evidence,
    reviews,
    knowledge,
    audit,
  };

  return json({ workItem: response, work_item: response });
});

/** Update metadata, assignment, or a non-acceptance lifecycle stage. */
export const PATCH = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const existing = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectWrite(existing.projectId, ctx.user);
  const body = await parseBody(request, patchSchema);

  if (["awaiting_acceptance", "accepted"].includes(existing.status)) {
    throw new ApiError("待验收或已验收的工作项不能再修改", 409);
  }

  if (
    ["awaiting_acceptance", "accepted"].includes(existing.status) &&
    (body.acceptance_criteria !== undefined || body.review_policy !== undefined || body.acceptance_policy !== undefined)
  ) {
    throw new ApiError("提交验收后不能修改验收标准或策略", 409);
  }

  const requestedStatus = body.stage ?? body.status;
  if (body.stage && body.status && body.stage !== body.status) {
    throw new ApiError("stage 和 status 必须一致", 400);
  }
  if (requestedStatus && requestedStatus !== existing.status) {
    if (["awaiting_acceptance", "accepted", "rejected"].includes(requestedStatus)) {
      throw new ApiError("该阶段必须通过专用提交或验收接口改变", 400);
    }
    if (!canTransition(existing.status, requestedStatus)) {
      throw new ApiError(`不能从 ${existing.status} 转到 ${requestedStatus}`, 409);
    }
    if (requestedStatus === "cancelled" && ctx.user.role !== "admin") {
      await requireProjectManager(existing.projectId, ctx.user);
    }
    if (requestedStatus !== "cancelled" && existing.assigneeUserId && existing.assigneeUserId !== ctx.user.id) {
      await requireProjectManager(existing.projectId, ctx.user);
    }
  }

  const hasAssignmentField =
    body.assignee_user_id !== undefined || body.assignee_id !== undefined || body.assignee_device_id !== undefined;
  if (hasAssignmentField) await requireProjectManager(existing.projectId, ctx.user);
  const hasReviewerField =
    body.reviewer_user_id !== undefined || body.reviewer_id !== undefined || body.reviewer_device_id !== undefined;
  if (hasReviewerField || body.review_policy !== undefined || body.acceptance_policy !== undefined) {
    await requireProjectManager(existing.projectId, ctx.user);
  }
  const assigneeUserId = body.assignee_user_id ?? body.assignee_id;
  const assignee = hasAssignmentField
    ? await resolveWorkItemAssignee(existing.projectId, assigneeUserId, body.assignee_device_id)
    : { userId: existing.assigneeUserId, deviceId: existing.assigneeDeviceId };
  const reviewPolicy = body.review_policy ?? body.acceptance_policy ?? existing.reviewPolicy;
  const reviewer = hasReviewerField
    ? await resolveWorkItemReviewer(
        existing.projectId,
        body.reviewer_user_id ?? body.reviewer_id,
        body.reviewer_device_id,
        reviewPolicy as "human" | "agent" | "both"
      )
    : { userId: existing.reviewerUserId, deviceId: existing.reviewerDeviceId };

  if (body.parent_id !== undefined && body.parent_id !== existing.parentId) {
    if (body.parent_id === existing.id) throw new ApiError("工作项不能成为自己的父项", 400);
    const [parent] = body.parent_id
      ? await db.select().from(workItems).where(eq(workItems.id, body.parent_id)).limit(1)
      : [null];
    if (body.parent_id && !parent) throw new ApiError("父工作项不存在", 404);
    assertValidParent(parent ?? null, existing.kind as "requirement" | "task", existing.projectId);
  }

  const nextStatus = statusAfterAssignment(existing.status, requestedStatus, hasAssignmentField && Boolean(assignee));
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, existing.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(body.version, current.version);
    if (["awaiting_acceptance", "accepted"].includes(current.status)) {
      throw new ApiError("待验收或已验收的工作项不能再修改", 409);
    }

    const [row] = await tx
      .update(workItems)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.acceptance_criteria !== undefined ? { acceptanceCriteria: body.acceptance_criteria } : {}),
        ...(body.review_policy !== undefined || body.acceptance_policy !== undefined ? { reviewPolicy } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.due_at !== undefined ? { dueAt: body.due_at ? new Date(body.due_at) : null } : {}),
        ...(body.parent_id !== undefined ? { parentId: body.parent_id } : {}),
        ...(hasAssignmentField
          ? { assigneeUserId: assignee?.userId ?? null, assigneeDeviceId: assignee?.deviceId ?? null }
          : {}),
        ...(hasReviewerField
          ? { reviewerUserId: reviewer.userId, reviewerDeviceId: reviewer.deviceId }
          : {}),
        ...(nextStatus ? { status: nextStatus } : {}),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(workItems.id, current.id), eq(workItems.version, current.version)))
      .returning();
    if (!row) throw new ApiError("工作项已被其他人更新，请刷新后重试", 409);

    await tx.insert(workItemEvents).values({
      workItemId: row.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: nextStatus && nextStatus !== current.status ? "status_changed" : "updated",
      fromStatus: current.status,
      toStatus: row.status,
      payload: {
        changed_fields: Object.keys(body).filter((key) => key !== "version"),
        assignee_user_id: row.assigneeUserId,
        assignee_device_id: row.assigneeDeviceId,
        reviewer_user_id: row.reviewerUserId,
        reviewer_device_id: row.reviewerDeviceId,
      },
    });
    return row;
  });

  const response = toWorkItemResponse(updated);
  publishWorkItemUpdate({
    projectId: updated.projectId,
    workItemId: updated.id,
    actorUserId: ctx.user.id,
    status: updated.status,
    version: updated.version,
    eventType: requestedStatus && requestedStatus !== existing.status ? "status_changed" : "updated",
  });
  return json({ workItem: response, work_item: response });
});
