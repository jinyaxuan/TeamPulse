import { and, count, eq, gte } from "drizzle-orm";
import { db, projects, users, workItemEvents, workItems, type WorkItem } from "@/db";
import { ApiError } from "@/lib/api";
import { ensureVersion } from "@/lib/work-items";

const HOURLY_REQUEST_LIMIT = 10;

export async function isJevEnabled(projectId: string): Promise<boolean> {
  const [project] = await db
    .select({ enabled: projects.jevEnabled })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project?.enabled ?? false;
}

/** Reserve a user-wide JEV call before sending work-item data outside TeamPulse. */
export async function reserveJevRequest(
  item: WorkItem,
  actorUserId: string,
  actorDeviceId: string | null,
  expectedVersion: number
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // The user row serializes quota checks across concurrent requests and Pods.
    const [user] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, actorUserId))
      .for("update")
      .limit(1);
    if (!user) throw new ApiError("用户不存在或认证已失效", 401);

    const [project] = await tx
      .select({ enabled: projects.jevEnabled })
      .from(projects)
      .where(eq(projects.id, item.projectId))
      .limit(1);
    if (!project?.enabled) return false;

    const [current] = await tx
      .select({ version: workItems.version, status: workItems.status })
      .from(workItems)
      .where(eq(workItems.id, item.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError("工作项不存在", 404);
    ensureVersion(expectedVersion, current.version);

    const [usage] = await tx
      .select({ value: count() })
      .from(workItemEvents)
      .where(
        and(
          eq(workItemEvents.actorUserId, actorUserId),
          eq(workItemEvents.eventType, "jev_requested"),
          gte(workItemEvents.createdAt, new Date(Date.now() - 60 * 60 * 1000))
        )
      );
    if (Number(usage.value) >= HOURLY_REQUEST_LIMIT) {
      throw new ApiError("JEV 分析过于频繁，请稍后重试", 429);
    }

    await tx.insert(workItemEvents).values({
      workItemId: item.id,
      actorUserId,
      actorDeviceId,
      eventType: "jev_requested",
      fromStatus: current.status,
      toStatus: current.status,
      payload: { model: "jev-latest", input_version: current.version },
    });
    return true;
  });
}
