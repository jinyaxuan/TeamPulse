import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { db, knowledgeRecords } from "@/db";
import { handler, json, requireAuth } from "@/lib/api";
import { requireProjectMember } from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

/** Search published project knowledge for reuse by members and Agents. */
export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  await requireProjectMember(params.id, ctx.user);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const title = url.searchParams.get("title")?.trim() ?? "";
  const summary = url.searchParams.get("summary")?.trim() ?? "";
  const content = url.searchParams.get("content")?.trim() ?? "";
  const tag = url.searchParams.get("tag")?.trim() ?? "";
  const limit = limitSchema.parse(url.searchParams.get("limit") ?? undefined);
  const conditions = [
    eq(knowledgeRecords.projectId, params.id),
    eq(knowledgeRecords.status, "published"),
  ];
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(sql`(${knowledgeRecords.title} ILIKE ${pattern} OR ${knowledgeRecords.summary} ILIKE ${pattern} OR ${knowledgeRecords.content} ILIKE ${pattern})`);
  }
  if (title) conditions.push(ilike(knowledgeRecords.title, `%${title}%`));
  if (summary) conditions.push(ilike(knowledgeRecords.summary, `%${summary}%`));
  if (content) conditions.push(ilike(knowledgeRecords.content, `%${content}%`));
  if (tag) conditions.push(sql`${tag} = ANY(${knowledgeRecords.tags})`);

  const rows = await db
    .select()
    .from(knowledgeRecords)
    .where(and(...conditions))
    .orderBy(desc(knowledgeRecords.publishedAt), asc(knowledgeRecords.id))
    .limit(limit);
  const knowledge = rows.map((record) => ({
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
    published_at: record.publishedAt?.toISOString() ?? null,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  }));
  return json({ knowledge, knowledgeRecords: knowledge, count: knowledge.length });
});
