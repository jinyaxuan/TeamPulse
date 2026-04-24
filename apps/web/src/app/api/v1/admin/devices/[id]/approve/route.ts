import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, devices, users } from "@/db";
import { ApiError, handler, json, parseBody, requireAdminAuth } from "@/lib/api";
import { generateBearerToken } from "@/lib/auth";

const approveSchema = z.object({
  user_name: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "only letters, digits, underscore, hyphen allowed"),
  display_name: z.string().trim().max(128).optional(),
});

/**
 * POST /api/v1/admin/devices/:id/approve
 * Body: { user_name, display_name? }
 *
 * Approves a pending device:
 *  1. Upserts a user by name (creates if missing)
 *  2. Mints a new bearer token
 *  3. Updates device row: status=active, user_id, token_hash, pending_token=raw
 *  4. Plugin will fetch pending_token on its next claim-code poll, then we
 *     clear it.
 */
export const POST = handler<{ id: string }>(async (request, params) => {
  await requireAdminAuth(request);

  const body = await parseBody(request, approveSchema);
  const userName = body.user_name.toLowerCase();

  const [device] = await db.select().from(devices).where(eq(devices.id, params.id)).limit(1);
  if (!device) throw new ApiError("device not found", 404);
  if (device.status !== "pending") {
    throw new ApiError(`device is '${device.status}', cannot approve`, 409);
  }

  // Upsert user by name.
  let [user] = await db.select().from(users).where(eq(users.name, userName)).limit(1);
  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        name: userName,
        displayName: body.display_name ?? userName,
        email: device.gitEmail ?? null,
        role: "member",
      })
      .returning();
    user = created;
  }

  const { token, hash } = generateBearerToken();

  await db
    .update(devices)
    .set({
      status: "active",
      userId: user.id,
      tokenHash: hash,
      pendingToken: token,
      claimCode: null,
      approvedAt: new Date(),
    })
    .where(and(eq(devices.id, device.id), eq(devices.status, "pending")));

  return json({
    device_id: device.id,
    user: { id: user.id, name: user.name, display_name: user.displayName },
  });
});
