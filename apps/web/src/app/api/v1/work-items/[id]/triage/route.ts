import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, workItemEvents, workItems } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { env } from "@/lib/env";
import { isAllowedTriageOrigin, JevServiceError, triageWorkItem } from "@/lib/jev";
import { isJevEnabled, reserveJevRequest } from "@/lib/jev-project-policy";
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

  const disabledResponse = () =>
    json({ error: "该项目尚未启用 JEV 分析", code: "JEV_PROJECT_DISABLED" }, { status: 403 });
  if (!(await isJevEnabled(item.projectId))) return disabledResponse();

  const provider = env.JEV_BASE_URL
    ? { endpoint: `${env.JEV_BASE_URL}/chat/completions`, apiKey: env.JEV_API_KEY, model: env.JEV_MODEL || "local-model" }
    : env.TYPESAFE_API_KEY;
  if (!provider) throw new ApiError("JEV 未配置，请联系管理员设置 JEV_BASE_URL 或 TYPESAFE_API_KEY", 503);
  if (!(await reserveJevRequest(item, ctx.user.id, ctx.deviceId ?? null, body.version))) {
    return disabledResponse();
  }

  let triage;
  try {
    triage = await triageWorkItem(item, provider);
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
