import { desc, eq, gt, and, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db, projects, tasks, type User } from "@/db";
import { visibleProjectsCondition } from "@/lib/project-access";
import { nonTestProjectCondition } from "@/lib/test-data";

export type ProjectStat = {
  id: string;
  display_name: string | null;
  git_remote_hash: string;
  git_remote_url: string | null;
  created_at: Date;
  last_activity: Date | null;
  active_count: number;
};

/**
 * Project listing with per-project aggregates. Uses LEFT JOIN + GROUP BY
 * instead of correlated subqueries (clearer SQL + more predictable under
 * Drizzle's raw sql interpolation).
 */
export async function listProjectsWithStats({
  includeTestData = false,
  user,
}: {
  includeTestData?: boolean;
  user?: Pick<User, "id" | "role">;
} = {}): Promise<ProjectStat[]> {
  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const conditions: SQL[] = [];
  if (!includeTestData) conditions.push(nonTestProjectCondition());
  const visibility = user ? visibleProjectsCondition(user) : undefined;
  if (visibility) conditions.push(visibility);

  const query = db
    .select({
      id: projects.id,
      display_name: projects.displayName,
      git_remote_hash: projects.gitRemoteHash,
      git_remote_url: projects.gitRemoteUrl,
      created_at: projects.createdAt,
      last_activity: sql<Date | null>`MAX(${tasks.startedAt})`.as("last_activity"),
      active_count: sql<number>`COUNT(DISTINCT CASE WHEN ${tasks.status} = 'active' AND ${tasks.heartbeatAt} > ${activeCutoff}::timestamptz THEN ${tasks.userId} END)::int`.as(
        "active_count"
      ),
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id));

  const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return rows;
}

// Silence unused imports when called in isolation.
void gt;
void and;
