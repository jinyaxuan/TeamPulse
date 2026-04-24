import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/db";
import { handler, json, parseBody, requireAuth } from "@/lib/api";
import { publishPresence } from "@/lib/presence";

const endSessionSchema = z.object({
  session_id: z.string().min(1).max(128),
  outcome: z.enum(["done", "abandoned"]).default("done"),
});

/**
 * POST /api/v1/tasks/end-session
 * Called by Stop hook. Marks all active tasks for this (session, user)
 * as done/abandoned in a single UPDATE. Publishes one ended event per
 * affected task.
 */
export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, endSessionSchema);

  const affected = await db
    .update(tasks)
    .set({
      status: body.outcome,
      endedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.sessionId, body.session_id),
        eq(tasks.userId, ctx.user.id),
        eq(tasks.status, "active")
      )
    )
    .returning({ id: tasks.id, projectId: tasks.projectId });

  for (const t of affected) {
    publishPresence({
      type: "task.ended",
      project_id: t.projectId,
      task_id: t.id,
      outcome: body.outcome,
    });
  }

  return json({ ended_count: affected.length });
});
