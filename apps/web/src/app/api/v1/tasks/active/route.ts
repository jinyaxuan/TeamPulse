import { and, desc, eq, gt } from "drizzle-orm";
import { db, tasks, users } from "@/db";
import { handler, json, requireAuth } from "@/lib/api";
import { visibleTasksCondition } from "@/lib/project-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/tasks/active?project=X
 * List active tasks in a project (or across all projects if project is omitted).
 * "Active" means status='active' and heartbeat within the last 15 minutes.
 */
export const GET = handler(async (request) => {
  const ctx = await requireAuth(request);
  const url = new URL(request.url);
  const projectId = url.searchParams.get("project");

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);

  const conditions = [eq(tasks.status, "active"), gt(tasks.heartbeatAt, cutoff)];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  const visibility = visibleTasksCondition(ctx.user);
  if (visibility) conditions.push(visibility);

  const rows = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      intent: tasks.intent,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      started_at: tasks.startedAt,
      heartbeat_at: tasks.heartbeatAt,
      client: tasks.client,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.heartbeatAt))
    .limit(100);

  return json({ tasks: rows });
});
