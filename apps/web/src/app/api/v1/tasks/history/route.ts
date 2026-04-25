import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, tasks, users } from "@/db";
import { handler, json, requireAuth } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/tasks/history
 *
 * Query params:
 *   project   — filter by project_id
 *   user      — filter by user name
 *   since     — ISO timestamp; tasks started after this
 *   until     — ISO timestamp; tasks started before this
 *   status    — active | done | abandoned (default: all)
 *   limit     — max 500, default 100
 */
export const GET = handler(async (request) => {
  await requireAuth(request);
  const url = new URL(request.url);

  const projectId = url.searchParams.get("project");
  const userName = url.searchParams.get("user");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const statusParam = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const conditions: SQL[] = [];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (since) {
    const d = new Date(since);
    if (!isNaN(d.getTime())) conditions.push(gte(tasks.startedAt, d));
  }
  if (until) {
    const d = new Date(until);
    if (!isNaN(d.getTime())) conditions.push(lte(tasks.startedAt, d));
  }
  if (statusParam) {
    const wanted = statusParam.split(",").filter((s) => ["active", "done", "abandoned"].includes(s));
    if (wanted.length) conditions.push(inArray(tasks.status, wanted));
  }

  let userFilter: SQL | undefined;
  if (userName) {
    userFilter = eq(users.name, userName);
  }

  const rows = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      intent: tasks.intent,
      summary: tasks.summary,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      status: tasks.status,
      started_at: tasks.startedAt,
      ended_at: tasks.endedAt,
      heartbeat_at: tasks.heartbeatAt,
      client: tasks.client,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(userFilter ? and(...conditions, userFilter) : and(...conditions))
    .orderBy(desc(tasks.startedAt))
    .limit(limit);

  return json({ tasks: rows });
});
