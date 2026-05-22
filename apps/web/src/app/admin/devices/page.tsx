import { desc, eq } from "drizzle-orm";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Workspace } from "@/components/ui/workspace";
import { db, devices, users } from "@/db";
import { DevicesClient, type ActiveDevice, type PendingDevice } from "./devices-client";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const pending: PendingDevice[] = await db
    .select({
      id: devices.id,
      claim_code: devices.claimCode,
      hostname: devices.hostname,
      os: devices.os,
      git_email: devices.gitEmail,
      agent_name: devices.agentName,
      agent_type: devices.agentType,
      agent_role: devices.agentRole,
      capabilities: devices.capabilities,
      registered_at: devices.registeredAt,
    })
    .from(devices)
    .where(eq(devices.status, "pending"))
    .orderBy(desc(devices.registeredAt));

  const active: ActiveDevice[] = await db
    .select({
      id: devices.id,
      hostname: devices.hostname,
      os: devices.os,
      git_email: devices.gitEmail,
      agent_name: devices.agentName,
      agent_type: devices.agentType,
      agent_role: devices.agentRole,
      capabilities: devices.capabilities,
      last_used_at: devices.lastUsedAt,
      approved_at: devices.approvedAt,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(eq(devices.status, "active"))
    .orderBy(desc(devices.lastUsedAt));

  const existingUsers = await db
    .select({ name: users.name, display_name: users.displayName })
    .from(users)
    .orderBy(users.name);

  const codexCount = active.filter((device) => device.agent_type === "codex").length;
  const claudeCount = active.filter((device) => device.agent_type === "claude-code").length;
  const capabilityCount = new Set(active.flatMap((device) => device.capabilities)).size;
  const recentActive = active.filter(
    (device) => device.last_used_at && device.last_used_at.getTime() > Date.now() - 24 * 60 * 60 * 1000
  ).length;

  return (
    <Workspace>
      <PageHeader
        eyebrow="Agent 接入控制台"
        title="Agent 管理"
        description="审核新设备、查看 Agent 身份和能力边界，确认每台机器归属到正确成员。"
        actions={
          <>
            <ActionLink href="/settings/connect">接入指引</ActionLink>
            <ActionLink href="/admin/users" variant="primary">用户管理</ActionLink>
          </>
        }
        meta={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="online">{active.length} 台已启用</StatusBadge>
            <StatusBadge tone="warning">{pending.length} 台待认领</StatusBadge>
            <StatusBadge tone="agent">{codexCount} 台 Codex</StatusBadge>
            <StatusBadge>{capabilityCount} 种能力</StatusBadge>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="已启用 Agent" value={active.length} detail={`${recentActive} 台 24 小时内使用`} tone="online" />
        <MetricCard label="待认领" value={pending.length} detail="等待管理员绑定成员" tone="warning" />
        <MetricCard label="Codex / Claude" value={`${codexCount}/${claudeCount}`} detail="按客户端类型统计" tone="agent" />
        <MetricCard label="能力标签" value={capabilityCount} detail={`${existingUsers.length} 个可绑定用户`} tone="default" />
      </section>

      <DevicesClient
        pending={pending}
        active={active}
        existingUsers={existingUsers}
      />
    </Workspace>
  );
}
