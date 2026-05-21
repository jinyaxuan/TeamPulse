import { redirect } from "next/navigation";
import { eq, desc, and } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db, orders, plans as plansTable } from "@/db";
import { getInstancePlan, getActiveSubscription } from "@/lib/subscription";
import { UpgradeButton } from "./upgrade-button";
import { OrderHistory } from "./order-history";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const plan = await getInstancePlan();
  const subscription = await getActiveSubscription(user.id);

  // Fetch order history for this user
  const userOrders = await db
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
    })
    .from(orders)
    .where(eq(orders.userId, user.id))
    .orderBy(desc(orders.createdAt))
    .limit(20);

  // Count usage
  const { users: usersTable, devices } = await import("@/db");
  const { isNull, count } = await import("drizzle-orm");
  const [{ value: memberCount }] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(isNull(usersTable.revokedAt));
  const [{ value: deviceCount }] = await db
    .select({ value: count() })
    .from(devices)
    .where(eq(devices.status, "active"));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">订阅计费</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理你的 TeamPulse 订阅方案
        </p>
      </div>

      {/* Payment status message */}
      {params.payment === "success" && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          支付成功！你的订阅已激活。
        </div>
      )}
      {params.payment === "unknown" && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          支付状态确认中，请稍候刷新页面查看。
        </div>
      )}

      {/* Current Plan */}
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">当前方案</h2>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                {plan.name}
              </span>
              {subscription && (
                <span className="text-sm text-muted-foreground">
                  到期时间：{new Date(subscription.currentPeriodEnd).toLocaleDateString("zh-CN")}
                </span>
              )}
            </div>
          </div>
          {plan.slug === "free" && (
            <UpgradeButton planSlug="pro" />
          )}
        </div>

        {/* Usage Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">团队成员</div>
            <div className="mt-1 text-lg font-semibold">
              {memberCount}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}/ {plan.maxMembers >= 999999 ? "无限" : plan.maxMembers}
              </span>
            </div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">活跃设备</div>
            <div className="mt-1 text-lg font-semibold">
              {deviceCount}
              <span className="text-sm font-normal text-muted-foreground">
                {" "}/ {plan.maxDevicesPerUser >= 999999 ? "无限" : `${plan.maxDevicesPerUser}/人`}
              </span>
            </div>
          </div>
          <div className="rounded-md border p-4">
            <div className="text-xs text-muted-foreground">项目上限</div>
            <div className="mt-1 text-lg font-semibold">
              {plan.maxProjects >= 999999 ? "无限" : plan.maxProjects}
            </div>
          </div>
        </div>

        {/* Upgrade CTA for free plan */}
        {plan.slug === "free" && (
          <div className="mt-6 rounded-md bg-slate-50 border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              升级到专业版，解锁 10 名成员、无限项目、冲突检测等高级功能
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              ¥49<span className="text-sm font-normal text-muted-foreground">/月</span>
            </p>
          </div>
        )}

        {/* Renew for paid plan */}
        {plan.slug !== "free" && subscription && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              需要续费？可选择延长 1-12 个月
            </p>
            <UpgradeButton planSlug={plan.slug} label="续费" />
          </div>
        )}
      </section>

      {/* Order History */}
      {userOrders.length > 0 && (
        <section className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="font-semibold">订单记录</h2>
          <OrderHistory orders={userOrders} />
        </section>
      )}
    </div>
  );
}
