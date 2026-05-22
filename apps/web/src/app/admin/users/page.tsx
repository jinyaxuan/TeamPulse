import { desc, eq, count } from "drizzle-orm";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Workspace } from "@/components/ui/workspace";
import { db, devices, inviteCodes, tasks, users } from "@/db";
import { InviteCodesPanel, type InviteCodeRow } from "./invite-codes-panel";
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

  const inviteRows: InviteCodeRow[] = await db
    .select({
      id: inviteCodes.id,
      label: inviteCodes.label,
      max_uses: inviteCodes.maxUses,
      uses: inviteCodes.uses,
      created_at: inviteCodes.createdAt,
      expires_at: inviteCodes.expiresAt,
      last_used_at: inviteCodes.lastUsedAt,
      revoked_at: inviteCodes.revokedAt,
    })
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt));

  const activeUsers = enriched.filter((user) => !user.revoked_at).length;
  const adminUsers = enriched.filter((user) => !user.revoked_at && user.role === "admin").length;
  const totalDevices = enriched.reduce((sum, user) => sum + Number(user.device_count), 0);
  const totalTasks = enriched.reduce((sum, user) => sum + Number(user.task_count), 0);
  const usableInvites = inviteRows.filter((invite) => {
    const expired = invite.expires_at ? invite.expires_at.getTime() <= Date.now() : false;
    return !invite.revoked_at && !expired && invite.uses < invite.max_uses;
  }).length;

  return (
    <Workspace>
      <PageHeader
        eyebrow="后台权限中心"
        title="用户管理"
        description="邀请码、成员角色和账号状态集中在这里；成员加入后会自动继承邀请人的团队可见范围。"
        actions={
          <>
            <ActionLink href="/team">团队视图</ActionLink>
            <ActionLink href="/admin/devices" variant="primary">Agent 管理</ActionLink>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="online">{activeUsers} 个可用账号</StatusBadge>
            <StatusBadge tone="agent">{adminUsers} 个管理员</StatusBadge>
            <StatusBadge>{usableInvites} 个可用邀请码</StatusBadge>
            <StatusBadge>{totalDevices} 台设备</StatusBadge>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="可用账号" value={activeUsers} detail={`共 ${enriched.length} 个账号`} tone="online" />
        <MetricCard label="管理员" value={adminUsers} detail="拥有后台权限" tone="agent" />
        <MetricCard label="邀请码" value={usableInvites} detail={`${inviteRows.length} 条历史记录`} tone="warning" />
        <MetricCard label="任务记录" value={totalTasks} detail={`${totalDevices} 台绑定设备`} tone="default" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <InviteCodesPanel inviteCodes={inviteRows} />
        <UsersTable users={enriched} />
      </section>
    </Workspace>
  );
}
