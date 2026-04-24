import { count, desc, eq, isNull } from "drizzle-orm";
import { db, devices, tasks, users } from "@/db";
import { handler, json, requireAdminAuth } from "@/lib/api";

/**
 * GET /api/v1/admin/users
 * List all users with their device count + task count.
 */
export const GET = handler(async (request) => {
  await requireAdminAuth(request);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      display_name: users.displayName,
      email: users.email,
      role: users.role,
      created_at: users.createdAt,
      revoked_at: users.revokedAt,
      device_count: count(devices.id),
    })
    .from(users)
    .leftJoin(devices, eq(devices.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  // Fetch task counts separately (can't do two LEFT JOINs in one query easily).
  const taskCounts = await db
    .select({ user_id: tasks.userId, task_count: count(tasks.id) })
    .from(tasks)
    .groupBy(tasks.userId);

  const taskMap = new Map(taskCounts.map((r) => [r.user_id, r.task_count]));

  return json({
    users: rows.map((u) => ({
      ...u,
      task_count: taskMap.get(u.id) ?? 0,
    })),
  });
});

// Silence unused imports for strict mode.
void isNull;
