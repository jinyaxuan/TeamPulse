import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, workItemEvents, workItems } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { env } from "@/lib/env";
import { isAllowedTriageOrigin, JevServiceError, triageWorkItem } from "@/lib/jev";
import { rateLimit } from "@/lib/rate-limit";
import {
  ensureVersion,
  publishWorkItemUpdate,
  requireProjectWrite,
  requireVisibleWorkItem,
} from "@/lib/work-items";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const triageSchema = z.object({ version: z.number().int().positive() });

/** Return and audit advisory JEV decisions; do not change the work item. */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  if (ctx.source === "session" && !isAllowedTriageOrigin(request.headers.get("origin"), env.PUBLIC_APP_URL)) {
    throw new ApiError("请求来源无效", 403);
  }
  const item = await requireVisibleWorkItem(params.id, ctx.user);
  await requireProjectWrite(item.projectId, ctx.user);
  const body = await parseBody(request, triageSchema);
  ensureVersion(body.version, item.version);

  const apiKey = env.TYPESAFE_API_KEY;
  if (!apiKey) throw new ApiError("JEV 未配置，请联系管理员设置 TYPESAFE_API_KEY", 503);
  if (!rateLimit(`jev-triage:${ctx.user.id}`, 10, 60 * 60 * 1000).allowed) {
    throw new ApiError("JEV 分析过于频繁，请稍后重试", 429);
  }

  let triage;
  try {
    triage = await triageWorkItem(item, apiKey);
  } catch (error) {
    if (error instanceof JevServiceError) throw new ApiError(error.message, error.status);
    throw error;
  }

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workItems)
      .where(eq(workItems.id, item.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(body.version, current.version);
    await tx.insert(workItemEvents).values({
      workItemId: current.id,
      actorUserId: ctx.user.id,
      actorDeviceId: ctx.deviceId ?? null,
      eventType: "jev_triaged",
      fromStatus: current.status,
      toStatus: current.status,
      payload: { model: triage.model, input_version: current.version, triage },
    });
  });

  publishWorkItemUpdate({
    projectId: item.projectId,
    workItemId: item.id,
    actorUserId: ctx.user.id,
    status: item.status,
    version: item.version,
    eventType: "jev_triaged",
  });
  return json({ triage });
});
