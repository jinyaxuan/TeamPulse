import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, knowledgeRecords, workItemEvents } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { canManageProjectMembers } from "@/lib/project-access";
import {
  publishWorkItemUpdate,
  requireProjectManager,
  requireProjectMember,
  requireProjectWrite,
  requireVisibleWorkItem,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(20000),
  summary: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  source_event_ids: z.array(z.string().uuid()).max(100).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  source: z.string().trim().max(128).optional(),
});

export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const item = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectMember(item.projectId, ctx.user);
  const canSeeDraftKnowledge = await canManageProjectMembers(item.projectId, ctx.user);
  const rows = await db
    .select()
    .from(knowledgeRecords)
    .where(eq(knowledgeRecords.workItemId, item.id))
    .orderBy(asc(knowledgeRecords.createdAt));
  const knowledge = rows
    .filter((record) => record.status === "published" || record.createdBy === ctx.user.id || canSeeDraftKnowledge)
    .map(toKnowledgeResponse);
  return json({ knowledge, knowledgeRecords: knowledge });
});

export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const item = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectWrite(item.projectId, ctx.user);
  const body = await parseBody(request, createSchema);

  if (item.status !== "accepted") {
    throw new ApiError("只有已验收的工作项可以沉淀为知识", 409);
  }
  if (body.status === "published") await requireProjectManager(item.projectId, ctx.user);

  const created = await db.transaction(async (tx) => {
    const acceptedEvents = await tx
      .select({ id: workItemEvents.id })
      .from(workItemEvents)
      .where(and(eq(workItemEvents.workItemId, item.id), eq(workItemEvents.eventType, "accepted")));
    if (acceptedEvents.length === 0) {
      throw new ApiError("工作项缺少验收事件，不能建立知识来源", 409);
    }

    const sourceEventIds = body.source_event_ids?.length
      ? body.source_event_ids
      : [acceptedEvents[acceptedEvents.length - 1].id];
    const sourceRows = await tx
      .select({ id: workItemEvents.id, eventType: workItemEvents.eventType })
      .from(workItemEvents)
      .where(and(eq(workItemEvents.workItemId, item.id), inArray(workItemEvents.id, sourceEventIds)));
    if (sourceRows.length !== sourceEventIds.length || !sourceRows.some((row) => row.eventType === "accepted")) {
      throw new ApiError("知识来源必须属于该工作项，并包含验收事件", 400);
    }

    const published = body.status === "published";
    const [record] = await tx
      .insert(knowledgeRecords)
      .values({
        projectId: item.projectId,
        workItemId: item.id,
        title: body.title,
        content: body.content,
        summary: body.summary ?? null,
        tags: body.tags,
        sourceEventIds,
        createdBy: ctx.user.id,
        status: body.status,
        publishedBy: published ? ctx.user.id : null,
        publishedAt: published ? new Date() : null,
      })
      .returning();
    await tx.insert(workItemEvents).values({
      workItemId: item.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: "knowledge_created",
      payload: { knowledge_id: record.id, status: record.status, source_event_ids: sourceEventIds },
    });
    return record;
  });

  publishWorkItemUpdate({
    projectId: item.projectId,
    workItemId: item.id,
    actorUserId: ctx.user.id,
    status: item.status,
    version: item.version,
    eventType: "knowledge_created",
  });
  return json({ knowledge: toKnowledgeResponse(created) }, { status: 201 });
});

function toKnowledgeResponse(record: typeof knowledgeRecords.$inferSelect) {
  return {
    id: record.id,
    project_id: record.projectId,
    work_item_id: record.workItemId,
    title: record.title,
    content: record.content,
    summary: record.summary,
    tags: record.tags,
    source_event_ids: record.sourceEventIds,
    status: record.status,
    published_by: record.publishedBy,
    created_by: record.createdBy,
    published_at: record.publishedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    createdAt: record.createdAt,
    source: "work_item",
  };
}
