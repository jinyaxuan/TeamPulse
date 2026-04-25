import { eq } from "drizzle-orm";
import { db, inviteCodes } from "@/db";
import { ApiError, handler, json, requireAdminAuth } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = handler<{ id: string }>(async (request, params) => {
  await requireAdminAuth(request);

  const [revoked] = await db
    .update(inviteCodes)
    .set({ revokedAt: new Date() })
    .where(eq(inviteCodes.id, params.id))
    .returning({ id: inviteCodes.id });

  if (!revoked) {
    throw new ApiError("邀请码不存在", 404);
  }

  return json({ id: revoked.id, status: "revoked" });
});
