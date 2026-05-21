import { eq } from "drizzle-orm";
import { db, subscriptions } from "@/db";
import { handler, json, requireAuth, ApiError } from "@/lib/api";
import { getActiveSubscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);
  const sub = await getActiveSubscription(ctx.user.id);

  if (!sub) {
    throw new ApiError("没有活跃的订阅", 400);
  }

  await db
    .update(subscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, sub.id));

  return json({ success: true, message: "订阅已取消，将在当前周期结束后生效" });
});
