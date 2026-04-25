import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, devices } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { generateBearerToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const claimSelfSchema = z.object({
  claim_code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/.test(value), {
      message: "认领码格式应类似 AB-CD-EF",
    }),
});

/**
 * Self-service device claim.
 *
 * A logged-in user enters the claim code printed by their local plugin
 * registration command. The device is then bound directly to that current
 * web account, avoiding admin-side user-name guessing when many accounts exist.
 */
export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, claimSelfSchema);

  const [device] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.claimCode, body.claim_code), eq(devices.status, "pending")))
    .limit(1);

  if (!device) {
    throw new ApiError("未找到待认领设备，请确认认领码仍有效", 404);
  }

  const { token, hash } = generateBearerToken();
  const [updated] = await db
    .update(devices)
    .set({
      status: "active",
      userId: ctx.user.id,
      tokenHash: hash,
      pendingToken: token,
      claimCode: null,
      approvedAt: new Date(),
    })
    .where(and(eq(devices.id, device.id), eq(devices.status, "pending")))
    .returning({
      id: devices.id,
      hostname: devices.hostname,
      os: devices.os,
      userId: devices.userId,
    });

  return json({
    device: updated,
    user: {
      id: ctx.user.id,
      name: ctx.user.name,
      display_name: ctx.user.displayName,
    },
  });
});
