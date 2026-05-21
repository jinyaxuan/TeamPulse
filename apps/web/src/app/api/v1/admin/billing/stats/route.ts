import { eq, and, gte, sum, count } from "drizzle-orm";
import { db, orders, subscriptions } from "@/db";
import { handler, json, requireAdminAuth } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdminAuth(request);

  // Total revenue (all paid orders)
  const [{ totalRevenue }] = await db
    .select({ totalRevenue: sum(orders.amount) })
    .from(orders)
    .where(eq(orders.status, "paid"));

  // This month's revenue
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [{ monthlyRevenue }] = await db
    .select({ monthlyRevenue: sum(orders.amount) })
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.paidAt, monthStart)));

  // Active subscriptions
  const [{ activeSubCount }] = await db
    .select({ activeSubCount: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        gte(subscriptions.currentPeriodEnd, new Date())
      )
    );

  // Total orders
  const [{ totalOrders }] = await db
    .select({ totalOrders: count() })
    .from(orders);

  // Paid orders count
  const [{ paidOrders }] = await db
    .select({ paidOrders: count() })
    .from(orders)
    .where(eq(orders.status, "paid"));

  return json({
    totalRevenue: Number(totalRevenue ?? 0), // in fen
    monthlyRevenue: Number(monthlyRevenue ?? 0),
    activeSubscriptions: activeSubCount,
    totalOrders,
    paidOrders,
  });
});
