import { and, count, desc, eq, gte, isNull, max, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const memberStats = await db
    .select({
      id: users.id,
      name: users.name,
      display_name: users.displayName,
      role: users.role,
      task_count: count(tasks.id),
      last_active: max(tasks.startedAt),
      active_now: sql<number>`
        COUNT(*) FILTER (
          WHERE ${tasks.status} = 'active'
          AND ${tasks.heartbeatAt} > ${new Date(Date.now() - 15 * 60 * 1000).toISOString()}
        )::int
      `.as("active_now"),
    })
    .from(users)
    .leftJoin(tasks, and(eq(tasks.userId, users.id), gte(tasks.startedAt, since)))
    .where(isNull(users.revokedAt))
    .groupBy(users.id)
    .orderBy(desc(max(tasks.startedAt)));

  const maxCount = Math.max(1, ...memberStats.map((m) => m.task_count));

  return (
    <AppShell user={sessionUser} activeNav="team">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Activity over the last 7 days. Bar width is proportional to task count.
          </p>
        </div>

        <div className="space-y-2">
          {memberStats.length === 0 && (
            <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
              No team members yet.
            </div>
          )}
          {memberStats.map((m) => {
            const pct = Math.round((m.task_count / maxCount) * 100);
            return (
              <div key={m.id} className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.display_name ?? m.name}</span>
                    <span className="text-xs text-muted-foreground">@{m.name}</span>
                    {m.role === "admin" && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        admin
                      </span>
                    )}
                    {m.active_now > 0 && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        active now
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {m.task_count} task{m.task_count === 1 ? "" : "s"}
                    {m.last_active && ` · last ${formatRelativeTime(m.last_active)}`}
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
