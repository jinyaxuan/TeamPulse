import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  user?: string;
  project?: string;
  days?: string;
  status?: string;
};

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const params = await searchParams;
  const days = Math.min(Math.max(Number(params.days ?? 7), 1), 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const conditions: SQL[] = [gte(tasks.startedAt, since)];
  if (params.project) conditions.push(eq(tasks.projectId, params.project));
  if (params.status) {
    const wanted = params.status.split(",").filter((s) => ["active", "done", "abandoned"].includes(s));
    if (wanted.length) conditions.push(inArray(tasks.status, wanted));
  }

  const userFilter: SQL | undefined = params.user ? eq(users.name, params.user) : undefined;

  const rows = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      intent: tasks.intent,
      summary: tasks.summary,
      status: tasks.status,
      branch: tasks.branch,
      started_at: tasks.startedAt,
      ended_at: tasks.endedAt,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(userFilter ? and(...conditions, userFilter) : and(...conditions))
    .orderBy(desc(tasks.startedAt))
    .limit(200);

  // Build an export CSV link that preserves current filters.
  const csvQuery = new URLSearchParams({
    days: String(days),
    ...(params.user ? { user: params.user } : {}),
    ...(params.project ? { project: params.project } : {}),
    ...(params.status ? { status: params.status } : {}),
    format: "csv",
  }).toString();

  return (
    <AppShell user={sessionUser} activeNav="activity">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Activity</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Team task history. Filter by user, project, status, or time range.
            </p>
          </div>
          <Link
            href={`/api/v1/activity/export?${csvQuery}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Export CSV
          </Link>
        </div>

        <FilterBar current={{ ...params, days: String(days) }} />

        <div className="overflow-hidden rounded-md border bg-card">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No activity matches these filters.
            </div>
          )}
          <ul className="divide-y">
            {rows.map((t) => (
              <li
                key={t.id}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-2 text-sm"
              >
                <div className="w-28 flex-shrink-0 text-xs text-muted-foreground">
                  {new Date(t.started_at).toLocaleString()}
                </div>
                <div className="min-w-0">
                  <div className="truncate">
                    <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                    <span className="text-muted-foreground"> — {t.intent}</span>
                  </div>
                  {t.branch && (
                    <div className="font-mono text-xs text-muted-foreground">branch:{t.branch}</div>
                  )}
                </div>
                <Link
                  href={`/projects/${t.project_id}`}
                  className="w-28 flex-shrink-0 truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t.project_name ?? "project"}
                </Link>
                <div
                  className={
                    "w-16 flex-shrink-0 rounded-full px-2 py-0.5 text-center text-xs " +
                    (t.status === "active"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : t.status === "done"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400")
                  }
                >
                  {t.status}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

function FilterBar({ current }: { current: SearchParams }) {
  return (
    <form action="/activity" method="get" className="flex flex-wrap gap-2 text-sm">
      <input
        name="user"
        placeholder="user name (e.g. alice)"
        defaultValue={current.user ?? ""}
        className="rounded-md border border-input bg-background px-3 py-1.5"
      />
      <select
        name="days"
        defaultValue={current.days ?? "7"}
        className="rounded-md border border-input bg-background px-3 py-1.5"
      >
        <option value="1">Last 24h</option>
        <option value="3">Last 3 days</option>
        <option value="7">Last 7 days</option>
        <option value="14">Last 2 weeks</option>
        <option value="30">Last 30 days</option>
      </select>
      <select
        name="status"
        defaultValue={current.status ?? ""}
        className="rounded-md border border-input bg-background px-3 py-1.5"
      >
        <option value="">All statuses</option>
        <option value="active">Active only</option>
        <option value="done">Done only</option>
        <option value="abandoned">Abandoned only</option>
      </select>
      <button
        type="submit"
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Apply
      </button>
    </form>
  );
}
