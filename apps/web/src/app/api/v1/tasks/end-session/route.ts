import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, tasks } from "@/db";
import { handler, json, parseBody, requireAuth } from "@/lib/api";
import { publishPresence } from "@/lib/presence";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const endSessionSchema = z.object({
  session_id: z.string().min(1).max(128),
  outcome: z.enum(["done", "abandoned"]).default("done"),
  summary: z.string().max(2000).optional(),
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
  const summary = body.summary?.trim();

  const affected = await db
    .update(tasks)
    .set({
      status: body.outcome,
      endedAt: new Date(),
      ...(summary ? { summary } : {}),
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

  return json({
    ended_count: affected.length,
    summary_saved: Boolean(summary && affected.length > 0),
  });
});
