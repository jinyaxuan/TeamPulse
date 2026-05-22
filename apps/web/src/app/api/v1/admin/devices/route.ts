import { desc, eq } from "drizzle-orm";
import { db, devices, users } from "@/db";
import { handler, json, requireAdminAuth } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * GET /api/v1/admin/devices
 * Returns { pending: Device[], active: (Device & {user_name})[] }
 */
export const GET = handler(async (request) => {
  await requireAdminAuth(request);

  const pending = await db
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

  const active = await db
    .select({
      id: devices.id,
      hostname: devices.hostname,
      os: devices.os,
      git_email: devices.gitEmail,
      agent_name: devices.agentName,
      agent_type: devices.agentType,
      agent_role: devices.agentRole,
      capabilities: devices.capabilities,
      status: devices.status,
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

  // Autocomplete source for admin approval form.
  const existingUserNames = await db
    .select({ name: users.name, display_name: users.displayName })
    .from(users)
    .orderBy(users.name);

  return json({
    pending,
    active,
    existing_users: existingUserNames,
  });
});
