import { and, desc, eq, gt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, projectMembers, projectMessages, taskOverlapResolutions, tasks, users } from "@/db";
import { ApiError, handler, json, requireAuth } from "@/lib/api";
import {
  canManageProjectMembers,
  getVisibleProject,
  isProjectMember,
  visibleTasksCondition,
  visibleUsersCondition,
} from "@/lib/project-access";
import { findActiveTaskOverlaps, taskOverlapKey } from "@/lib/task-overlap";
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
  const taskVisibility = visibleTasksCondition(ctx.user);
  const fullProjectView = await isProjectMember(project.id, ctx.user);
  const memberVisibility = fullProjectView ? undefined : visibleUsersCondition(ctx.user);

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
        gt(tasks.heartbeatAt, activeCutoff),
        ...(taskVisibility ? [taskVisibility] : [])
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
    .where(
      and(
        eq(tasks.projectId, project.id),
        gt(tasks.startedAt, recentCutoff),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
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
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        ...(memberVisibility ? [memberVisibility] : [])
      )
    )
    .orderBy(desc(projectMembers.lastSeenAt));

  const messageAuthor = alias(users, "message_author");
  const messageTarget = alias(users, "message_target");
  const recentMessages = await db
    .select({
      id: projectMessages.id,
      thread_key: projectMessages.threadKey,
      body: projectMessages.body,
      task_id: projectMessages.taskId,
      created_at: projectMessages.createdAt,
      author_id: projectMessages.authorId,
      author_name: messageAuthor.name,
      author_display_name: messageAuthor.displayName,
      target_user_id: projectMessages.targetUserId,
      target_user_name: messageTarget.name,
      target_user_display_name: messageTarget.displayName,
    })
    .from(projectMessages)
    .leftJoin(messageAuthor, eq(projectMessages.authorId, messageAuthor.id))
    .leftJoin(messageTarget, eq(projectMessages.targetUserId, messageTarget.id))
    .where(
      and(
        eq(projectMessages.projectId, project.id),
        ...(fullProjectView
          ? []
          : [
              or(
                eq(projectMessages.authorId, ctx.user.id),
                eq(projectMessages.targetUserId, ctx.user.id)
              )!,
            ])
      )
    )
    .orderBy(desc(projectMessages.createdAt))
    .limit(20);

  const activeOverlaps = findActiveTaskOverlaps(active);
  const activeOverlapKeys = new Set(activeOverlaps.map((overlap) => overlap.key));
  const activeOverlapResolutions =
    active.length > 0
      ? (
          await db
            .select({
              id: taskOverlapResolutions.id,
              first_task_id: taskOverlapResolutions.firstTaskId,
              second_task_id: taskOverlapResolutions.secondTaskId,
              action: taskOverlapResolutions.action,
              note: taskOverlapResolutions.note,
              resolved_by: taskOverlapResolutions.resolvedBy,
              resolved_by_name: users.name,
              resolved_by_display_name: users.displayName,
              updated_at: taskOverlapResolutions.updatedAt,
            })
            .from(taskOverlapResolutions)
            .leftJoin(users, eq(taskOverlapResolutions.resolvedBy, users.id))
            .where(eq(taskOverlapResolutions.projectId, project.id))
        ).filter((resolution) =>
          activeOverlapKeys.has(taskOverlapKey(resolution.first_task_id, resolution.second_task_id))
        )
      : [];

  return json({
    project: {
      id: project.id,
      display_name: project.displayName,
      git_remote_hash: project.gitRemoteHash,
      git_remote_url: project.gitRemoteUrl,
      created_at: project.createdAt,
    },
    active,
    active_overlaps: activeOverlaps,
    active_overlap_resolutions: activeOverlapResolutions.map((resolution) => ({
      ...resolution,
      key: taskOverlapKey(resolution.first_task_id, resolution.second_task_id),
    })),
    can_manage_members: await canManageProjectMembers(project.id, ctx.user),
    members,
    recent_messages: recentMessages.reverse(),
    recent,
  });
});
