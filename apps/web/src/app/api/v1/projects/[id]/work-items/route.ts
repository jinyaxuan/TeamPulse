import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, users, workItems, workItemEvents } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import {
  assertValidParent,
  requireProjectManager,
  requireProjectMember,
  requireProjectWrite,
  publishWorkItemUpdate,
  resolveWorkItemAssignee,
  resolveWorkItemReviewer,
  requireVisibleProjectForWorkItems,
  REVIEW_POLICIES,
  toWorkItemResponse,
  WORK_ITEM_KINDS,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  kind: z.enum(WORK_ITEM_KINDS).default("task"),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10000).optional().nullable(),
  acceptance_criteria: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  parent_id: z.string().uuid().optional().nullable(),
  assignee_user_id: z.string().uuid().optional().nullable(),
  assignee_id: z.string().uuid().optional().nullable(),
  assignee_device_id: z.string().uuid().optional().nullable(),
  reviewer_user_id: z.string().uuid().optional().nullable(),
  reviewer_id: z.string().uuid().optional().nullable(),
  reviewer_device_id: z.string().uuid().optional().nullable(),
  review_policy: z.enum(REVIEW_POLICIES).optional(),
  acceptance_policy: z.enum(REVIEW_POLICIES).optional(),
  due_at: z.string().datetime().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

/**
 * GET /api/v1/projects/:id/work-items
 * List durable requirements and tasks in a visible project.
 */
export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  await requireVisibleProjectForWorkItems(params.id, ctx.user);
  await requireProjectMember(params.id, ctx.user);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const parentId = url.searchParams.get("parent_id");
  const limit = clampLimit(url.searchParams.get("limit"));
  const conditions = [eq(workItems.projectId, params.id)];

  if (status) {
    const statuses = status.split(",").filter(Boolean);
    if (statuses.length) conditions.push(inArray(workItems.status, statuses));
  }
  if (parentId === "root") conditions.push(isNull(workItems.parentId));
  else if (parentId) conditions.push(eq(workItems.parentId, parentId));

  const assignee = alias(users, "work_item_assignee");
  const creator = alias(users, "work_item_creator");
  const rows = await db
    .select({
      item: workItems,
      assignee_name: assignee.name,
      assignee_display_name: assignee.displayName,
      creator_name: creator.name,
      creator_display_name: creator.displayName,
    })
    .from(workItems)
    .leftJoin(assignee, eq(workItems.assigneeUserId, assignee.id))
    .leftJoin(creator, eq(workItems.createdBy, creator.id))
    .where(and(...conditions))
    .orderBy(desc(workItems.updatedAt))
    .limit(limit);

  const workItemsResponse = rows.map((row) => ({
    ...toWorkItemResponse(row.item),
    assignee_name: row.assignee_display_name ?? row.assignee_name,
    assigneeName: row.assignee_display_name ?? row.assignee_name,
    requester_name: row.creator_display_name ?? row.creator_name,
    requesterName: row.creator_display_name ?? row.creator_name,
  }));
  return json({ workItems: workItemsResponse, work_items: workItemsResponse });
});

/**
 * POST /api/v1/projects/:id/work-items
 * Create a durable requirement/task. Assignment is explicit and recorded in
 * the first lifecycle event; existing `tasks` rows remain execution logs.
 */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  await requireVisibleProjectForWorkItems(params.id, ctx.user);
  await requireProjectWrite(params.id, ctx.user);
  const body = await parseBody(request, createSchema);

  if (!body.parent_id && body.kind === "task") {
    throw new ApiError("task 必须挂在 requirement 下", 400);
  }
  if (body.parent_id && body.kind === "requirement") {
    throw new ApiError("requirement 必须是根节点", 400);
  }
  let parent = null;
  if (body.parent_id) {
    const [row] = await db.select().from(workItems).where(eq(workItems.id, body.parent_id)).limit(1);
    parent = row ?? null;
    if (!parent) throw new ApiError("父工作项不存在", 404);
  }
  assertValidParent(parent, body.kind, params.id);

  const assignee = await resolveWorkItemAssignee(params.id, body.assignee_user_id ?? body.assignee_id, body.assignee_device_id);
  const reviewPolicy = body.review_policy ?? body.acceptance_policy ?? "both";
  if (assignee || (body.review_policy && body.review_policy !== "both") || (body.acceptance_policy && body.acceptance_policy !== "both") || body.reviewer_user_id || body.reviewer_id || body.reviewer_device_id) {
    await requireProjectManager(params.id, ctx.user);
  }
  const reviewer = await resolveWorkItemReviewer(
    params.id,
    body.reviewer_user_id ?? body.reviewer_id,
    body.reviewer_device_id,
    reviewPolicy
  );
  const status = assignee ? "assigned" : "intake";

  const created = await db.transaction(async (tx) => {
    const [item] = await tx
      .insert(workItems)
      .values({
        projectId: params.id,
        parentId: body.parent_id ?? null,
        kind: body.kind,
        title: body.title,
        description: body.description ?? null,
        acceptanceCriteria: body.acceptance_criteria,
        status,
        priority: body.priority,
        dueAt: body.due_at ? new Date(body.due_at) : null,
        assigneeUserId: assignee?.userId ?? null,
        assigneeDeviceId: assignee?.deviceId ?? null,
        reviewerUserId: reviewer.userId,
        reviewerDeviceId: reviewer.deviceId,
        reviewPolicy,
        createdBy: ctx.user.id,
      })
      .returning();

    await tx.insert(workItemEvents).values({
      workItemId: item.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: "created",
      toStatus: status,
      payload: {
        kind: body.kind,
        parent_id: body.parent_id ?? null,
        assignee_user_id: assignee?.userId ?? null,
        assignee_device_id: assignee?.deviceId ?? null,
        reviewer_user_id: reviewer.userId,
        reviewer_device_id: reviewer.deviceId,
        review_policy: reviewPolicy,
      },
    });
    return item;
  });

  const response = toWorkItemResponse(created);
  publishWorkItemUpdate({
    projectId: created.projectId,
    workItemId: created.id,
    actorUserId: ctx.user.id,
    status: created.status,
    version: created.version,
    eventType: "created",
  });
  return json({ workItem: response, work_item: response }, { status: 201 });
});

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? 100);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.trunc(parsed)));
}
