import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, knowledgeRecords, workItemEvents } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { canManageProjectMembers } from "@/lib/project-access";
import {
  publishWorkItemUpdate,
  requireProjectWrite,
  requireVisibleWorkItem,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
  summary: z.string().trim().max(2000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

/** Edit a knowledge candidate, or let a project owner publish/archive it. */
export const PATCH = handler<{ id: string; knowledgeId: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const item = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectWrite(item.projectId, ctx.user);
  const body = await parseBody(request, patchSchema);
  const isManager = await canManageProjectMembers(item.projectId, ctx.user);

  if (item.status !== "accepted") {
    throw new ApiError("来源工作项尚未验收", 409);
  }

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(knowledgeRecords)
      .where(and(eq(knowledgeRecords.id, params.knowledgeId), eq(knowledgeRecords.workItemId, item.id)))
      .for("update")
      .limit(1);
    if (!existing) throw new ApiError("知识记录不存在", 404);
    if (existing.status === "draft" && existing.createdBy !== ctx.user.id && !isManager) {
      throw new ApiError("只有草稿作者或项目 owner 可以编辑", 403);
    }
    if (existing.status !== "draft" && !isManager) {
      throw new ApiError("只有项目 owner 可以修改已发布知识", 403);
    }
    if (body.status && body.status !== existing.status && !isManager) {
      throw new ApiError("只有项目 owner 可以发布或归档知识", 403);
    }
    if (existing.status === "published") {
      if (body.status !== "archived" || Object.keys(body).some((key) => key !== "status")) {
        throw new ApiError("已发布知识只能归档；修订请新建草稿并重新发布", 409);
      }
    }
    if (existing.status === "archived") {
      throw new ApiError("已归档知识不可修改；修订请新建草稿并重新发布", 409);
    }
    const [record] = await tx
      .update(knowledgeRecords)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.status === "published"
          ? { publishedBy: ctx.user.id, publishedAt: new Date() }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeRecords.id, existing.id))
      .returning();
    await tx.insert(workItemEvents).values({
      workItemId: item.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: body.status === "published" ? "knowledge_published" : body.status === "archived" ? "knowledge_archived" : "knowledge_updated",
      payload: { knowledge_id: record.id, from_status: existing.status, to_status: record.status },
    });
    return record;
  });

  publishWorkItemUpdate({
    projectId: item.projectId,
    workItemId: item.id,
    actorUserId: ctx.user.id,
    status: item.status,
    version: item.version,
    eventType: body.status === "published" ? "knowledge_published" : "knowledge_updated",
  });
  return json({ knowledge: updated });
});
