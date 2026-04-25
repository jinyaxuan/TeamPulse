import { and, desc, eq, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, projectMembers, projectMessages, tasks, users } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { canWriteProject, getVisibleProject } from "@/lib/project-access";
import { publishPresence } from "@/lib/presence";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_THREAD_KEY = "project";

const messageSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    thread_key: z.string().trim().min(1).max(160).optional(),
    task_id: z.string().uuid().optional(),
    to_user_id: z.string().uuid().optional(),
    to: z.string().trim().min(1).max(160).optional(),
  })
  .refine((body) => !(body.to_user_id && body.to), {
    message: "to_user_id 和 to 只能提供一个",
    path: ["to"],
  });

export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, messageSchema);

  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);
  if (!(await canWriteProject(project.id, ctx.user))) {
    throw new ApiError("你在该项目中是只读角色，不能发送项目消息", 403);
  }

  const target = await resolveTargetUser(project.id, body.to_user_id, body.to);
  const taskId = body.task_id ? await resolveTaskId(project.id, body.task_id) : null;
  const threadKey = body.thread_key?.trim() || (taskId ? `task:${taskId}` : DEFAULT_THREAD_KEY);

  const [message] = await db
    .insert(projectMessages)
    .values({
      projectId: project.id,
      authorId: ctx.user.id,
      targetUserId: target?.id ?? null,
      threadKey,
      taskId,
      body: body.body,
    })
    .returning();

  const payload = {
    id: message.id,
    project_id: message.projectId,
    thread_key: message.threadKey,
    body: message.body,
    author_id: ctx.user.id,
    author_name: ctx.user.name,
    author_display_name: ctx.user.displayName,
    target_user_id: target?.id ?? null,
    target_user_name: target?.name ?? null,
    target_user_display_name: target?.displayName ?? null,
    task_id: message.taskId,
    created_at: message.createdAt.toISOString(),
  };

  publishPresence({
    type: "message.created",
    project_id: project.id,
    message: payload,
  });

  return json({ message: payload }, { status: 201 });
});

export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const project = await getVisibleProject(params.id, ctx.user);
  if (!project) throw new ApiError("项目不存在", 404);

  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));
  const threadKey = url.searchParams.get("thread_key")?.trim();
  const inboxOnly = url.searchParams.get("inbox") === "1";

  const conditions: SQL[] = [eq(projectMessages.projectId, project.id)];
  if (threadKey) conditions.push(eq(projectMessages.threadKey, threadKey));
  if (inboxOnly) {
    const inboxCondition = or(
      eq(projectMessages.targetUserId, ctx.user.id),
      eq(projectMessages.authorId, ctx.user.id)
    );
    if (inboxCondition) conditions.push(inboxCondition);
  }

  const rows = await selectMessages()
    .where(and(...conditions))
    .orderBy(desc(projectMessages.createdAt))
    .limit(limit);

  return json({ messages: rows.reverse() });
});

function selectMessages() {
  const author = alias(users, "message_author");
  const target = alias(users, "message_target");

  return db
    .select({
      id: projectMessages.id,
      project_id: projectMessages.projectId,
      thread_key: projectMessages.threadKey,
      body: projectMessages.body,
      task_id: projectMessages.taskId,
      created_at: projectMessages.createdAt,
      author_id: projectMessages.authorId,
      author_name: author.name,
      author_display_name: author.displayName,
      target_user_id: projectMessages.targetUserId,
      target_user_name: target.name,
      target_user_display_name: target.displayName,
    })
    .from(projectMessages)
    .leftJoin(author, eq(projectMessages.authorId, author.id))
    .leftJoin(target, eq(projectMessages.targetUserId, target.id));
}

async function resolveTargetUser(projectId: string, targetUserId?: string, target?: string) {
  if (!targetUserId && !target) return null;

  const matchCondition = targetUserId
    ? eq(users.id, targetUserId)
    : or(eq(users.name, target!), eq(users.email, target!), eq(users.displayName, target!));
  if (!matchCondition) throw new ApiError("接收人参数无效", 400);

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      displayName: users.displayName,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(and(eq(projectMembers.projectId, projectId), matchCondition))
    .limit(1);

  if (!row) throw new ApiError("接收人不是该项目成员", 404);
  return row;
}

async function resolveTaskId(projectId: string, taskId: string) {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.id, taskId)))
    .limit(1);
  if (!task) throw new ApiError("消息关联的任务不存在或不属于该项目", 404);
  return task.id;
}

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}
