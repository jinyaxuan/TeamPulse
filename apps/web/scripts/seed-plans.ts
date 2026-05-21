/**
 * Seed pricing plans. Idempotent — uses ON CONFLICT DO UPDATE.
 * Run via: pnpm tsx scripts/seed-plans.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { db, plans } from "../src/db";
import { sql } from "drizzle-orm";

const PLANS = [
  {
    slug: "free",
    name: "免费版",
    description: "适合个人开发者体验",
    priceMonthly: 0,
    maxMembers: 2,
    maxProjects: 3,
    maxDevicesPerUser: 1,
    featuresJson: JSON.stringify([
      "task_tracking",
      "presence",
      "memory_sync",
    ]),
    isActive: 1,
    sortOrder: 0,
  },
  {
    slug: "pro",
    name: "专业版",
    description: "适合小型开发团队",
    priceMonthly: 4900, // ¥49/月
    maxMembers: 10,
    maxProjects: 999999,
    maxDevicesPerUser: 3,
    featuresJson: JSON.stringify([
      "task_tracking",
      "presence",
      "memory_sync",
      "overlap_detection",
      "message_threads",
      "activity_export",
      "priority_support",
    ]),
    isActive: 1,
    sortOrder: 1,
  },
  {
    slug: "enterprise",
    name: "企业版",
    description: "适合大型团队和企业",
    priceMonthly: 0, // contact sales
    maxMembers: 999999,
    maxProjects: 999999,
    maxDevicesPerUser: 999999,
    featuresJson: JSON.stringify([
      "task_tracking",
      "presence",
      "memory_sync",
      "overlap_detection",
      "message_threads",
      "activity_export",
      "priority_support",
      "self_hosted",
      "custom_oidc",
      "dedicated_support",
    ]),
    isActive: 1,
    sortOrder: 2,
  },
];

async function main() {
  for (const plan of PLANS) {
    await db
      .insert(plans)
      .values(plan)
      .onConflictDoUpdate({
        target: plans.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          priceMonthly: sql`excluded.price_monthly`,
          maxMembers: sql`excluded.max_members`,
          maxProjects: sql`excluded.max_projects`,
          maxDevicesPerUser: sql`excluded.max_devices_per_user`,
          featuresJson: sql`excluded.features_json`,
          isActive: sql`excluded.is_active`,
          sortOrder: sql`excluded.sort_order`,
        },
      });
    console.log(`✓ Upserted plan: ${plan.slug} (${plan.name})`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
