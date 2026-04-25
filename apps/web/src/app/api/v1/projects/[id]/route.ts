import { and, desc, eq, gt } from "drizzle-orm";
import { db, projectMembers, tasks, users } from "@/db";
import { ApiError, handler, json, requireAuth } from "@/lib/api";
import { canManageProjectMembers, getVisibleProject } from "@/lib/project-access";
import { findActiveTaskOverlaps } from "@/lib/task-overlap";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/projects/:id
 * Project details + active tasks + recent history (last 24h).
 */
export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);

  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);

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

  const members = await db
    .select({
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
      role: projectMembers.role,
      source: projectMembers.source,
      joined_at: projectMembers.createdAt,
      last_seen_at: projectMembers.lastSeenAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, project.id))
    .orderBy(desc(projectMembers.lastSeenAt));

  return json({
    project: {
      id: project.id,
      display_name: project.displayName,
      git_remote_hash: project.gitRemoteHash,
      git_remote_url: project.gitRemoteUrl,
      created_at: project.createdAt,
    },
    active,
    active_overlaps: findActiveTaskOverlaps(active),
    can_manage_members: await canManageProjectMembers(project.id, ctx.user),
    members,
    recent,
  });
});
