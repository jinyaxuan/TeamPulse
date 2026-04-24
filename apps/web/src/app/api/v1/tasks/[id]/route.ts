import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { publishPresence } from "@/lib/presence";

const patchTaskSchema = z.object({
  status: z.enum(["active", "done", "abandoned"]).optional(),
  intent: z.string().min(1).max(500).optional(),
  summary: z.string().max(2000).optional(),
  add_files: z.array(z.string()).max(100).optional(),
});

/**
 * PATCH /api/v1/tasks/:id
 * Update task: status change, intent/summary edit, add files_touched.
 * Authorized users: owner of the task, or an admin.
 */
export const PATCH = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, patchTaskSchema);

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, params.id)).limit(1);
  if (!existing) throw new ApiError("task not found", 404);

  if (existing.userId !== ctx.user.id && ctx.user.role !== "admin") {
    throw new ApiError("not the task owner", 403);
  }

  const updates: Partial<typeof tasks.$inferInsert> = {};
  if (body.status) {
    updates.status = body.status;
    if (body.status !== "active") {
      updates.endedAt = new Date();
    }
  }
  if (body.intent !== undefined) updates.intent = body.intent;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.add_files?.length) {
    const merged = Array.from(new Set([...existing.filesTouched, ...body.add_files]));
    updates.filesTouched = merged;
  }
  updates.heartbeatAt = new Date();

  const [updated] = await db
    .update(tasks)
    .set(updates)
    .where(eq(tasks.id, existing.id))
    .returning();

  if (body.status && body.status !== "active") {
    publishPresence({
      type: "task.ended",
      project_id: existing.projectId,
      task_id: existing.id,
      outcome: body.status as "done" | "abandoned",
    });
  }

  return json({ task: updated });
});

/**
 * GET /api/v1/tasks/:id
 * Fetch a single task (owner or admin only).
 */
export const GET = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, params.id)).limit(1);
  if (!task) throw new ApiError("task not found", 404);
  if (task.userId !== ctx.user.id && ctx.user.role !== "admin") {
    throw new ApiError("not authorized", 403);
  }
  return json({ task });
});
