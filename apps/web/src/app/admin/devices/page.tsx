import { desc, eq } from "drizzle-orm";
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">设备管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Claude Code、Codex 和通用 Agent 注册的新设备会在这里等待认领。管理员也可以在这里代成员绑定设备。
        </p>
      </div>
      <DevicesClient
        pending={pending}
        active={active}
        existingUsers={existingUsers}
      />
    </div>
  );
}
