import { and, eq, lt } from "drizzle-orm";
import { db, tasks } from "@/db";
import { publishPresence } from "./presence";

const ABANDONED_AFTER_MS = 15 * 60 * 1000; // 15 minutes with no heartbeat
const SWEEP_INTERVAL_MS = 60 * 1000; // every 60s

declare global {
  // eslint-disable-next-line no-var
  var __teampulse_sweep_timer: NodeJS.Timeout | undefined;
}

/**
 * Finds active tasks with stale heartbeats, flips them to 'abandoned',
 * and publishes task.ended events for SSE subscribers.
 *
 * Idempotent — re-runs return 0 affected rows if nothing is stale.
 */
export async function runSweepOnce(): Promise<number> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);

  const affected = await db
    .update(tasks)
    .set({
      status: "abandoned",
      endedAt: new Date(),
    })
    .where(and(eq(tasks.status, "active"), lt(tasks.heartbeatAt, cutoff)))
    .returning({ id: tasks.id, projectId: tasks.projectId, userId: tasks.userId });

  for (const t of affected) {
    publishPresence({
      type: "task.ended",
      project_id: t.projectId,
      task_id: t.id,
      user_id: t.userId,
      outcome: "abandoned",
    });
  }

  return affected.length;
}

/**
 * Kicks off a recurring sweep timer once per Node process. Re-mounting
 * in Next.js dev HMR is a no-op because we store the handle on `globalThis`.
 *
 * This is module-top-level idempotent: the first import starts it; subsequent
 * imports do nothing.
 */
export function startSweepLoop() {
  if (globalThis.__teampulse_sweep_timer) return;

  // Run once on startup to catch anything that expired while the server was down.
  runSweepOnce().catch((err) => console.error("[teampulse] initial sweep failed:", err));

  globalThis.__teampulse_sweep_timer = setInterval(() => {
    runSweepOnce().catch((err) => console.error("[teampulse] sweep failed:", err));
  }, SWEEP_INTERVAL_MS);
}
