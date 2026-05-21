/**
 * Subscription business logic: get plan, activate subscription, generate order IDs.
 */
import { eq, and, desc } from "drizzle-orm";
import { db, plans, subscriptions, users } from "@/db";
import type { Plan, Subscription } from "@/db";

/** Generate a unique trade order ID: TP-YYYYMMDDHHmmss-XXXXXX */
export function generateTradeOrderId(): string {
  const now = new Date();
  const ts = now
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TP-${ts}-${rand}`;
}

/** Get a plan by slug. */
export async function getPlanBySlug(slug: string): Promise<Plan | null> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, slug))
    .limit(1);
  return plan ?? null;
}

/** Get all active plans sorted by sortOrder. */
export async function getActivePlans(): Promise<Plan[]> {
  return db
    .select()
    .from(plans)
    .where(eq(plans.isActive, 1))
    .orderBy(plans.sortOrder);
}

/** Get the active subscription for a user (the admin who holds the instance subscription). */
export async function getActiveSubscription(
  userId: string
): Promise<(Subscription & { plan: Plan }) | null> {
  const rows = await db
    .select()
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      )
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  if (!rows.length) return null;
  const row = rows[0];
  return { ...row.subscriptions, plan: row.plans };
}

/**
 * Get the effective plan for the instance. Checks if any admin user has
 * an active subscription; falls back to the free plan.
 */
export async function getInstancePlan(): Promise<Plan> {
  // Find any admin with an active subscription
  const rows = await db
    .select()
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(
      and(
        eq(subscriptions.status, "active"),
        eq(users.role, "admin")
      )
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  if (rows.length) {
    const sub = rows[0].subscriptions;
    // Check if still within period
    if (new Date(sub.currentPeriodEnd) > new Date()) {
      return rows[0].plans;
    }
    // Expired — mark it
    await db
      .update(subscriptions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  }

  // Fallback to free plan
  const freePlan = await getPlanBySlug("free");
  if (!freePlan) throw new Error("Free plan not found — run seed-plans");
  return freePlan;
}

/** Create or extend a subscription after successful payment. */
export async function activateSubscription(
  userId: string,
  planId: string,
  months: number
): Promise<Subscription> {
  const existing = await getActiveSubscription(userId);
  const now = new Date();

  if (existing && existing.planId === planId && new Date(existing.currentPeriodEnd) > now) {
    // Extend existing subscription
    const newEnd = new Date(existing.currentPeriodEnd);
    newEnd.setMonth(newEnd.getMonth() + months);
    const [updated] = await db
      .update(subscriptions)
      .set({
        currentPeriodEnd: newEnd,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id))
      .returning();
    return updated;
  }

  // Cancel old subscriptions for this user
  if (existing) {
    await db
      .update(subscriptions)
      .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
      .where(eq(subscriptions.id, existing.id));
  }

  // Create new subscription
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + months);

  const [newSub] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return newSub;
}
