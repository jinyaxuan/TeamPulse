import { and, eq, inArray } from "drizzle-orm";
import { db, devices } from "@/db";
import { ApiError, handler, json, requireAdminAuth } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * POST /api/v1/admin/devices/:id/revoke
 * Reject a pending device or revoke an active one.
 */
export const POST = handler<{ id: string }>(async (request, params) => {
  await requireAdminAuth(request);

  const [device] = await db.select().from(devices).where(eq(devices.id, params.id)).limit(1);
  if (!device) throw new ApiError("device not found", 404);

  const nextStatus = device.status === "pending" ? "rejected" : "revoked";

  await db
    .update(devices)
    .set({
      status: nextStatus,
      revokedAt: new Date(),
      tokenHash: null,
      pendingToken: null,
      claimCode: null,
    })
    .where(
      and(
        eq(devices.id, device.id),
        inArray(devices.status, ["pending", "active"])
      )
    );

  return json({ device_id: device.id, status: nextStatus });
});
