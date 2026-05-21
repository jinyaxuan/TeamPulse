import { desc, eq, and, gte } from "drizzle-orm";
import { db, orders, users, plans, subscriptions } from "@/db";
import { sum, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AdminBillingPage() {
  // Revenue stats
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [{ totalRevenue }] = await db
    .select({ totalRevenue: sum(orders.amount) })
    .from(orders)
    .where(eq(orders.status, "paid"));

  const [{ monthlyRevenue }] = await db
    .select({ monthlyRevenue: sum(orders.amount) })
    .from(orders)
    .where(and(eq(orders.status, "paid"), gte(orders.paidAt, monthStart)));

  const [{ activeSubCount }] = await db
    .select({ activeSubCount: count() })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        gte(subscriptions.currentPeriodEnd, new Date())
      )
    );

  // Recent orders
  const recentOrders = await db
    .select({
      id: orders.id,
      tradeOrderId: orders.tradeOrderId,
      amount: orders.amount,
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
    .limit(50);

  // Active subscriptions
  const activeSubs = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      userName: users.name,
      userDisplayName: users.displayName,
      planName: plans.name,
      status: subscriptions.status,
      periodStart: subscriptions.currentPeriodStart,
      periodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.status, "active"))
    .orderBy(desc(subscriptions.currentPeriodEnd));

  const statusMap: Record<string, { label: string; cls: string }> = {
    pending: { label: "待支付", cls: "bg-amber-100 text-amber-800" },
    paid: { label: "已支付", cls: "bg-emerald-100 text-emerald-800" },
    failed: { label: "失败", cls: "bg-red-100 text-red-800" },
    refunded: { label: "已退款", cls: "bg-slate-100 text-slate-800" },
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">计费管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">收入统计、订单管理和订阅状态</p>
      </div>

      {/* Revenue Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-t-4 border-t-emerald-500 bg-white p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">总收入</div>
          <div className="mt-2 text-2xl font-semibold">
            ¥{((Number(totalRevenue ?? 0)) / 100).toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-t-4 border-t-blue-500 bg-white p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">本月收入</div>
          <div className="mt-2 text-2xl font-semibold">
            ¥{((Number(monthlyRevenue ?? 0)) / 100).toFixed(2)}
          </div>
        </div>
        <div className="rounded-lg border border-t-4 border-t-purple-500 bg-white p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">活跃订阅</div>
          <div className="mt-2 text-2xl font-semibold">{activeSubCount}</div>
        </div>
      </div>

      {/* Active Subscriptions */}
      {activeSubs.length > 0 && (
        <section>
          <h2 className="mb-4 font-semibold">活跃订阅</h2>
          <div className="overflow-hidden rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">用户</th>
                  <th className="px-4 py-2 text-left">套餐</th>
                  <th className="px-4 py-2 text-left">开始日期</th>
                  <th className="px-4 py-2 text-left">到期日期</th>
                </tr>
              </thead>
              <tbody>
                {activeSubs.map((sub) => (
                  <tr key={sub.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2">
                      {sub.userDisplayName ?? sub.userName}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
                        {sub.planName}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(sub.periodStart).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(sub.periodEnd).toLocaleDateString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Orders */}
      <section>
        <h2 className="mb-4 font-semibold">订单记录</h2>
        {recentOrders.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
            暂无订单
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">订单</th>
                  <th className="px-4 py-2 text-left">用户</th>
                  <th className="px-4 py-2 text-left">套餐</th>
                  <th className="px-4 py-2 text-left">金额</th>
                  <th className="px-4 py-2 text-left">状态</th>
                  <th className="px-4 py-2 text-left">时间</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const s = statusMap[order.status] ?? statusMap.pending;
                  return (
                    <tr key={order.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2">
                        <div className="text-xs text-muted-foreground">
                          {order.tradeOrderId}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {order.userDisplayName ?? order.userName}
                      </td>
                      <td className="px-4 py-2">{order.planName}</td>
                      <td className="px-4 py-2">
                        ¥{(order.amount / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
                        >
                          {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
