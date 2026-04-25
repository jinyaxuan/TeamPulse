import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, taskOverlapResolutions, tasks, users } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { canWriteProject, getVisibleProject } from "@/lib/project-access";
import { orderedTaskPair, taskOverlapKey } from "@/lib/task-overlap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const overlapActionSchema = z.object({
  first_task_id: z.string().uuid(),
  second_task_id: z.string().uuid(),
  action: z.enum(["acknowledged", "handoff", "paused"]),
  note: z.string().trim().max(1000).optional(),
});

export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, overlapActionSchema);

  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await canWriteProject(project.id, ctx.user))) {
    throw new ApiError("你在该项目中是只读角色，不能更新冲突状态", 403);
  }
  if (body.first_task_id === body.second_task_id) {
    throw new ApiError("冲突任务不能是同一个任务", 400);
  }

  const [firstTaskId, secondTaskId] = orderedTaskPair(body.first_task_id, body.second_task_id);
  const matchingTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, project.id), inArray(tasks.id, [firstTaskId, secondTaskId])));
  if (matchingTasks.length !== 2) {
    throw new ApiError("冲突任务不存在或不属于该项目", 404);
  }

  const now = new Date();
  const [resolution] = await db
    .insert(taskOverlapResolutions)
    .values({
      projectId: project.id,
      firstTaskId,
      secondTaskId,
      action: body.action,
      note: body.note || null,
      resolvedBy: ctx.user.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        taskOverlapResolutions.projectId,
        taskOverlapResolutions.firstTaskId,
        taskOverlapResolutions.secondTaskId,
      ],
      set: {
        action: body.action,
        note: body.note || null,
        resolvedBy: ctx.user.id,
        updatedAt: now,
      },
    })
    .returning();

  return json({ resolution: withKey(resolution) });
});

export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);

  const rows = await db
    .select({
      id: taskOverlapResolutions.id,
      project_id: taskOverlapResolutions.projectId,
      first_task_id: taskOverlapResolutions.firstTaskId,
      second_task_id: taskOverlapResolutions.secondTaskId,
      action: taskOverlapResolutions.action,
      note: taskOverlapResolutions.note,
      resolved_by: taskOverlapResolutions.resolvedBy,
      resolved_by_name: users.name,
      resolved_by_display_name: users.displayName,
      created_at: taskOverlapResolutions.createdAt,
      updated_at: taskOverlapResolutions.updatedAt,
    })
    .from(taskOverlapResolutions)
    .leftJoin(users, eq(taskOverlapResolutions.resolvedBy, users.id))
    .where(eq(taskOverlapResolutions.projectId, project.id))
    .orderBy(desc(taskOverlapResolutions.updatedAt))
    .limit(100);

  return json({
    resolutions: rows.map((row) => ({
      ...row,
      key: taskOverlapKey(row.first_task_id, row.second_task_id),
    })),
  });
});

function withKey(resolution: typeof taskOverlapResolutions.$inferSelect) {
  return {
    id: resolution.id,
    project_id: resolution.projectId,
    first_task_id: resolution.firstTaskId,
    second_task_id: resolution.secondTaskId,
    key: taskOverlapKey(resolution.firstTaskId, resolution.secondTaskId),
    action: resolution.action,
    note: resolution.note,
    resolved_by: resolution.resolvedBy,
    created_at: resolution.createdAt,
    updated_at: resolution.updatedAt,
  };
}
