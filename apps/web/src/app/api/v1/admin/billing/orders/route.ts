import { desc, eq } from "drizzle-orm";
import { db, orders, users, plans } from "@/db";
import { handler, json, requireAdminAuth } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdminAuth(request);

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const rows = await db
    .select({
      id: orders.id,
      tradeOrderId: orders.tradeOrderId,
      amount: orders.amount,
      months: orders.months,
      title: orders.title,
      status: orders.status,
      paymentChannel: orders.paymentChannel,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      userName: users.name,
      userDisplayName: users.displayName,
      planName: plans.name,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  return json({ orders: rows });
});
