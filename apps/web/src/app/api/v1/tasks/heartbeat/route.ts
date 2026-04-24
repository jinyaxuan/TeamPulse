import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db, tasks, users } from "@/db";
import { handler, json, parseBody, requireAuth } from "@/lib/api";
import { publishPresence } from "@/lib/presence";

const heartbeatSchema = z.object({
  session_id: z.string().min(1).max(128),
  file_touched: z.string().max(512).optional(),
});

/**
 * POST /api/v1/tasks/heartbeat
 * Called by PostToolUse hook. Bumps heartbeat_at on the latest active task
 * for this session and optionally appends file_touched to files_touched.
 *
 * Idempotent — safe to call on debounce.
 */
export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, heartbeatSchema);

  // Find latest active task for this session + user.
  const [existing] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.sessionId, body.session_id),
        eq(tasks.userId, ctx.user.id),
        eq(tasks.status, "active")
      )
    )
    .orderBy(desc(tasks.startedAt))
    .limit(1);

  if (!existing) {
    return json({ updated: false });
  }

  const filesTouched =
    body.file_touched && !existing.filesTouched.includes(body.file_touched)
      ? [...existing.filesTouched, body.file_touched]
      : existing.filesTouched;

  const [updated] = await db
    .update(tasks)
    .set({
      heartbeatAt: new Date(),
      filesTouched,
    })
    .where(eq(tasks.id, existing.id))
    .returning();

  // Emit presence update only if files changed (reduces SSE chatter).
  if (body.file_touched && filesTouched !== existing.filesTouched) {
    publishPresence({
      type: "task.updated",
      project_id: existing.projectId,
      task: {
        id: updated.id,
        project_id: existing.projectId,
        user_id: ctx.user.id,
        user_name: ctx.user.name,
        user_display_name: ctx.user.displayName,
        intent: updated.intent,
        files_touched: updated.filesTouched,
        branch: updated.branch,
        status: updated.status,
        started_at: updated.startedAt.toISOString(),
        heartbeat_at: updated.heartbeatAt.toISOString(),
        client: updated.client,
      },
    });
  }

  return json({ updated: true, task_id: updated.id });
});

// Silence unused-import for users in dev (imported for type coherence).
void users;
