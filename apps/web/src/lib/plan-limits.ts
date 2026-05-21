/**
 * Feature gating: check usage against the current instance plan limits.
 */
import { count, eq, isNull, and } from "drizzle-orm";
import { db, users, projects, devices } from "@/db";
import { getInstancePlan } from "./subscription";
import type { Plan } from "@/db";
import { ApiError } from "./api";

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  planSlug: string;
  planName: string;
}

/** Check if adding another member would exceed the plan limit. */
export async function checkMemberLimit(): Promise<LimitCheck> {
  const plan = await getInstancePlan();
  const [{ value }] = await db
    .select({ value: count() })
    .from(users)
    .where(isNull(users.revokedAt));
  return {
    allowed: value < plan.maxMembers,
    current: value,
    limit: plan.maxMembers,
    planSlug: plan.slug,
    planName: plan.name,
  };
}

/** Check if creating another project would exceed the plan limit. */
export async function checkProjectLimit(): Promise<LimitCheck> {
  const plan = await getInstancePlan();
  const [{ value }] = await db.select({ value: count() }).from(projects);
  return {
    allowed: value < plan.maxProjects,
    current: value,
    limit: plan.maxProjects,
    planSlug: plan.slug,
    planName: plan.name,
  };
}

/** Check if registering another device would exceed the plan limit. */
export async function checkDeviceLimit(): Promise<LimitCheck> {
  const plan = await getInstancePlan();
  const [{ value }] = await db
    .select({ value: count() })
    .from(devices)
    .where(
      and(eq(devices.status, "active"))
    );
  // Total active devices across all users; compare against maxDevicesPerUser * memberCount
  const [{ memberCount }] = await db
    .select({ memberCount: count() })
    .from(users)
    .where(isNull(users.revokedAt));
  const totalLimit = plan.maxDevicesPerUser * memberCount;
  return {
    allowed: value < totalLimit,
    current: value,
    limit: totalLimit,
    planSlug: plan.slug,
    planName: plan.name,
  };
}

/** Check if a feature is available on the current plan. */
export async function checkFeature(feature: string): Promise<boolean> {
  const plan = await getInstancePlan();
  if (!plan.featuresJson) return false;
  const features: string[] = JSON.parse(plan.featuresJson);
  return features.includes(feature);
}

/** Throw ApiError if member limit is exceeded. */
export async function enforceMemberLimit(): Promise<void> {
  const check = await checkMemberLimit();
  if (!check.allowed) {
    throw new ApiError(
      `已达到${check.planName}成员上限（${check.limit}人），请升级套餐`,
      403
    );
  }
}

/** Throw ApiError if project limit is exceeded. */
export async function enforceProjectLimit(): Promise<void> {
  const check = await checkProjectLimit();
  if (!check.allowed) {
    throw new ApiError(
      `已达到${check.planName}项目上限（${check.limit}个），请升级套餐`,
      403
    );
  }
}

/** Throw ApiError if device limit is exceeded. */
export async function enforceDeviceLimit(): Promise<void> {
  const check = await checkDeviceLimit();
  if (!check.allowed) {
    throw new ApiError(
      `已达到${check.planName}设备上限（${check.limit}台），请升级套餐`,
      403
    );
  }
}

/** Throw ApiError if feature is not available. */
export async function enforceFeature(feature: string, label: string): Promise<void> {
  const allowed = await checkFeature(feature);
  if (!allowed) {
    const plan = await getInstancePlan();
    throw new ApiError(
      `${label}为专业版功能，当前套餐（${plan.name}）不支持，请升级`,
      403
    );
  }
}
