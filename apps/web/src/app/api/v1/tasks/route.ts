import { z } from "zod";
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db, projects, tasks, users } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { canWriteProject, ensureProjectMember, getVisibleProject } from "@/lib/project-access";
import { publishPresence } from "@/lib/presence";
import { findTaskOverlapWarnings } from "@/lib/task-overlap";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const startTaskSchema = z.object({
  project_id: z.string().uuid().optional(),
  git_remote_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  session_id: z.string().min(1).max(128),
  intent: z.string().min(1).max(500),
  branch: z.string().max(256).optional(),
  client: z.enum(["claude-code", "codex"]).default("claude-code"),
  files_hint: z.array(z.string()).max(100).optional(),
});

/**
 * POST /api/v1/tasks
 * Create a new active task. Returns { task_id, active_tasks } so the client
 * immediately sees who else is in this project.
 *
 * Either project_id or git_remote_hash must be provided.
 */
export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, startTaskSchema);

  // Resolve project_id from hash if needed.
  let projectId = body.project_id;
  let resolvedFromHash = false;
  if (!projectId && body.git_remote_hash) {
    const [p] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.gitRemoteHash, body.git_remote_hash))
      .limit(1);
    projectId = p?.id;
    resolvedFromHash = Boolean(projectId);
  }
  if (!projectId) {
    return json({ error: "需要提供 project_id 或 git_remote_hash" }, { status: 400 });
  }

  if (resolvedFromHash) {
    await ensureProjectMember(projectId, ctx.user.id, "activity");
    if (!(await canWriteProject(projectId, ctx.user))) {
      throw new ApiError("你在该项目中是只读角色，不能启动任务", 403);
    }
  } else {
    const project = await getVisibleProject(projectId, ctx.user);
    if (!project) throw new ApiError("项目不存在", 404);
    await ensureProjectMember(projectId, ctx.user.id, "activity");
    if (!(await canWriteProject(projectId, ctx.user))) {
      throw new ApiError("你在该项目中是只读角色，不能启动任务", 403);
    }
  }

  const intent = body.intent.trim().slice(0, 500);
  const branch = body.branch?.trim() || undefined;

  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      userId: ctx.user.id,
      sessionId: body.session_id,
      client: body.client,
      intent,
      branch,
      status: "active",
      filesTouched: body.files_hint ?? [],
    })
    .returning();

  // Fire presence event.
  publishPresence({
    type: "task.started",
    project_id: projectId,
    task: {
      id: task.id,
      project_id: projectId,
      user_id: ctx.user.id,
      user_name: ctx.user.name,
      user_display_name: ctx.user.displayName,
      intent: task.intent,
      files_touched: task.filesTouched,
      branch: task.branch,
      status: task.status,
      started_at: task.startedAt.toISOString(),
      heartbeat_at: task.heartbeatAt.toISOString(),
      client: task.client,
    },
  });

  // Fetch other active tasks in this project for the response.
  const activeOthers = await db
    .select({
      id: tasks.id,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
      intent: tasks.intent,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      started_at: tasks.startedAt,
      heartbeat_at: tasks.heartbeatAt,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.status, "active"),
        ne(tasks.id, task.id),
        gt(tasks.heartbeatAt, new Date(Date.now() - 15 * 60 * 1000))
      )
    )
    .orderBy(desc(tasks.heartbeatAt))
    .limit(20);

  return json({
    task_id: task.id,
    project_id: projectId,
    active_tasks: activeOthers,
    overlap_warnings: findTaskOverlapWarnings({
      branch: task.branch,
      filesTouched: task.filesTouched,
      activeTasks: activeOthers,
    }),
  });
});
