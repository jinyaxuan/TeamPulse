import { desc, eq, count } from "drizzle-orm";
import { db, devices, tasks, users } from "@/db";
import { UsersTable, type UserRow } from "./users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const userRows = await db
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

  const taskCounts = await db
    .select({ user_id: tasks.userId, task_count: count(tasks.id) })
    .from(tasks)
    .groupBy(tasks.userId);

  const taskMap = new Map(taskCounts.map((r) => [r.user_id, r.task_count]));

  const enriched: UserRow[] = userRows.map((u) => ({
    ...u,
    task_count: taskMap.get(u.id) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理成员角色和访问权限。团队成员用自己的账号到“我的接入”绑定各自的 Agent 设备。
        </p>
      </div>
      <UsersTable users={enriched} />
    </div>
  );
}
