import { and, desc, eq, gt } from "drizzle-orm";
import { db, projects, tasks, users } from "@/db";
import { ApiError, handler, json, requireAuth } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/projects/:id
 * Project details + active tasks + recent history (last 24h).
 */
export const GET = handler<{ id: string }>(async (request, params) => {
  await requireAuth(request);

  const [project] = await db.select().from(projects).where(eq(projects.id, params.id)).limit(1);
  if (!project) throw new ApiError("project not found", 404);

  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const active = await db
    .select({
      id: tasks.id,
      intent: tasks.intent,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      started_at: tasks.startedAt,
      heartbeat_at: tasks.heartbeatAt,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        eq(tasks.projectId, project.id),
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeCutoff)
      )
    )
    .orderBy(desc(tasks.heartbeatAt));

  const recent = await db
    .select({
      id: tasks.id,
      intent: tasks.intent,
      branch: tasks.branch,
      summary: tasks.summary,
      status: tasks.status,
      started_at: tasks.startedAt,
      ended_at: tasks.endedAt,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(and(eq(tasks.projectId, project.id), gt(tasks.startedAt, recentCutoff)))
    .orderBy(desc(tasks.startedAt))
    .limit(50);

  return json({
    project: {
      id: project.id,
      display_name: project.displayName,
      git_remote_hash: project.gitRemoteHash,
      created_at: project.createdAt,
    },
    active,
    recent,
  });
});
