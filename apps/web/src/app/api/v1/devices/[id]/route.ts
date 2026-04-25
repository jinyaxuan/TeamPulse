import { and, eq } from "drizzle-orm";
import { db, devices } from "@/db";
import { ApiError, handler, json, requireAuth } from "@/lib/api";
import { publishPresence } from "@/lib/presence";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * DELETE /api/v1/devices/:id
 * A user (session or bearer) can revoke their own device.
 * Admins can revoke any device — but they should use /api/v1/admin/devices/:id/revoke
 * which has richer bookkeeping. This endpoint is just for self-service.
 */
export const DELETE = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, params.id))
    .limit(1);
  if (!device) throw new ApiError("device not found", 404);

  if (device.userId !== ctx.user.id && ctx.user.role !== "admin") {
    throw new ApiError("can only revoke your own devices", 403);
  }

  await db
    .update(devices)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      tokenHash: null,
      pendingToken: null,
      claimCode: null,
    })
    .where(and(eq(devices.id, device.id)));

  return json({ device_id: device.id, status: "revoked" });
});

// Suppress unused import warning if publishPresence isn't used anywhere else.
void publishPresence;
