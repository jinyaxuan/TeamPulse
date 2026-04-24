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
        <h1 className="text-2xl font-semibold">Device Approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pending devices from Claude Code plugins wait here. Approve to bind them to a user.
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
