import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, devices } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { DevicesList } from "./devices-list";

export const dynamic = "force-dynamic";

export default async function MyDevicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      id: devices.id,
      hostname: devices.hostname,
      os: devices.os,
      status: devices.status,
      registered_at: devices.registeredAt,
      approved_at: devices.approvedAt,
      last_used_at: devices.lastUsedAt,
      revoked_at: devices.revokedAt,
    })
    .from(devices)
    .where(eq(devices.userId, user.id))
    .orderBy(desc(devices.approvedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My Devices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each Claude Code install on your machines shows up here. Revoke any
          device you no longer use (e.g. a lost laptop).
        </p>
      </div>

      <DevicesList devices={rows} />
    </div>
  );
}
