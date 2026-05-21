import { handler, json, requireAuth } from "@/lib/api";
import { getInstancePlan, getActiveSubscription } from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const ctx = await requireAuth(request);
  const plan = await getInstancePlan();
  const subscription = await getActiveSubscription(ctx.user.id);

  return json({
    plan: {
      slug: plan.slug,
      name: plan.name,
      maxMembers: plan.maxMembers,
      maxProjects: plan.maxProjects,
      maxDevicesPerUser: plan.maxDevicesPerUser,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
        }
      : null,
  });
});
