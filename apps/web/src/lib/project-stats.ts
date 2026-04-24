import { desc, eq, gt, and, sql } from "drizzle-orm";
import { db, projects, tasks } from "@/db";

export type ProjectStat = {
  id: string;
  display_name: string | null;
  git_remote_hash: string;
  created_at: Date;
  last_activity: Date | null;
  active_count: number;
};

/**
 * Project listing with per-project aggregates. Uses LEFT JOIN + GROUP BY
 * instead of correlated subqueries (clearer SQL + more predictable under
 * Drizzle's raw sql interpolation).
 */
export async function listProjectsWithStats(): Promise<ProjectStat[]> {
  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const rows = await db
    .select({
      id: projects.id,
      display_name: projects.displayName,
      git_remote_hash: projects.gitRemoteHash,
      created_at: projects.createdAt,
      last_activity: sql<Date | null>`MAX(${tasks.startedAt})`.as("last_activity"),
      active_count: sql<number>`COUNT(DISTINCT CASE WHEN ${tasks.status} = 'active' AND ${tasks.heartbeatAt} > ${activeCutoff}::timestamptz THEN ${tasks.userId} END)::int`.as(
        "active_count"
      ),
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return rows;
}

// Silence unused imports when called in isolation.
void gt;
void and;
