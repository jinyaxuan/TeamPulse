import { eq } from "drizzle-orm";
import { db, devices, users, webSessions } from "@/db";
import { ApiError, handler, json, requireAdminAuth } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


/**
 * POST /api/v1/admin/users/:id/revoke
 *
 * Fully kick a user out:
 *   - Mark users.revoked_at
 *   - Revoke all their devices (clears tokens)
 *   - Delete their web sessions (force logout)
 * Tasks are preserved for audit; new task creation from their bearer/session
 * will fail because auth lookups filter by isNull(revoked_at).
 */
export const POST = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAdminAuth(request);

  const [target] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  if (!target) throw new ApiError("user not found", 404);
  if (target.id === ctx.user.id) throw new ApiError("cannot revoke yourself", 400);

  const now = new Date();

  await db.update(users).set({ revokedAt: now }).where(eq(users.id, target.id));

  await db
    .update(devices)
    .set({ status: "revoked", revokedAt: now, tokenHash: null, pendingToken: null })
    .where(eq(devices.userId, target.id));

  await db.delete(webSessions).where(eq(webSessions.userId, target.id));

  return json({ user_id: target.id, status: "revoked" });
});
