import { and, count, desc, eq, gt, gte, isNull, max, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);

  const rawMemberStats = await db
    .select({
      id: users.id,
      name: users.name,
      display_name: users.displayName,
      role: users.role,
      task_count: count(tasks.id),
      done_count: sql<number>`
        COUNT(*) FILTER (WHERE ${tasks.status} = 'done')::int
      `.as("done_count"),
      abandoned_count: sql<number>`
        COUNT(*) FILTER (WHERE ${tasks.status} = 'abandoned')::int
      `.as("abandoned_count"),
      last_active: max(tasks.heartbeatAt),
    })
    .from(users)
    .leftJoin(tasks, and(eq(tasks.userId, users.id), gte(tasks.startedAt, since)))
    .where(isNull(users.revokedAt))
    .groupBy(users.id);

  const activeTasks = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
      client: tasks.client,
      intent: tasks.intent,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      started_at: tasks.startedAt,
      heartbeat_at: tasks.heartbeatAt,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(eq(tasks.status, "active"), gt(tasks.heartbeatAt, activeCutoff), isNull(users.revokedAt)))
    .orderBy(desc(tasks.heartbeatAt))
    .limit(20);

  const recentTasks = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      user_id: users.id,
      client: tasks.client,
      intent: tasks.intent,
      status: tasks.status,
      started_at: tasks.startedAt,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(gte(tasks.startedAt, since), isNull(users.revokedAt)))
    .orderBy(desc(tasks.startedAt))
    .limit(100);

  const activeCountByUser = new Map<string, number>();
  for (const task of activeTasks) {
    activeCountByUser.set(task.user_id, (activeCountByUser.get(task.user_id) ?? 0) + 1);
  }

  const memberStats = rawMemberStats.sort((a, b) => {
    const activeDelta = (activeCountByUser.get(b.id) ?? 0) - (activeCountByUser.get(a.id) ?? 0);
    if (activeDelta !== 0) return activeDelta;
    return timestamp(b.last_active) - timestamp(a.last_active);
  });

  const latestByUser = new Map<string, (typeof recentTasks)[number]>();
  for (const task of recentTasks) {
    if (!latestByUser.has(task.user_id)) latestByUser.set(task.user_id, task);
  }

  const maxCount = Math.max(1, ...memberStats.map((m) => m.task_count));
  const totalTasks = memberStats.reduce((sum, m) => sum + Number(m.task_count), 0);
  const completedTasks = memberStats.reduce((sum, m) => sum + Number(m.done_count), 0);
  const activeMembers = memberStats.filter((m) => (activeCountByUser.get(m.id) ?? 0) > 0).length;

  return (
    <AppShell user={sessionUser} activeNav="team">
      <div className="space-y-8">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Who is active now, what they are working on, and recent output over the last 7 days.
            </p>
          </div>
          <Link href="/activity" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
            View full activity
          </Link>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Members" value={memberStats.length} detail={`${activeMembers} active now`} />
          <MetricCard label="Live tasks" value={activeTasks.length} detail="heartbeat within 15 min" />
          <MetricCard label="7-day tasks" value={totalTasks} detail={`${completedTasks} completed`} />
          <MetricCard label="Recent events" value={recentTasks.length} detail="latest 100 shown in stats" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <SectionHeader title="Members" description="Sorted by live activity, then last heartbeat." />
            {memberStats.length === 0 && (
              <EmptyState>No team members yet.</EmptyState>
            )}
            {memberStats.map((m) => {
              const pct = Math.round((Number(m.task_count) / maxCount) * 100);
              const latest = latestByUser.get(m.id);
              const activeNow = activeCountByUser.get(m.id) ?? 0;
              return (
                <article key={m.id} className="rounded-md border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.display_name ?? m.name}</span>
                        <span className="text-xs text-muted-foreground">@{m.name}</span>
                        {m.role === "admin" && <RolePill>admin</RolePill>}
                        {activeNow > 0 && <LivePill>{plural(activeNow, "live task")}</LivePill>}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {plural(Number(m.task_count), "task")} in 7 days
                        {m.last_active && ` · last ${formatRelativeTime(m.last_active)}`}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-2 text-xs text-muted-foreground">
                      <span>{Number(m.done_count)} done</span>
                      <span>{Number(m.abandoned_count)} abandoned</span>
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>

                  {latest ? (
                    <div className="mt-3 flex flex-col gap-1 border-t pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 truncate">
                        <StatusPill status={latest.status} />
                        <span className="ml-2 text-muted-foreground">{latest.intent}</span>
                      </div>
                      <Link
                        href={`/projects/${latest.project_id}`}
                        className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {latest.project_name ?? "project"} · {formatRelativeTime(latest.started_at)}
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                      No tasks in the last 7 days.
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <aside className="space-y-3">
            <SectionHeader title="Live Now" description="Current tasks with fresh heartbeats." />
            {activeTasks.length === 0 && (
              <EmptyState>No active tasks right now.</EmptyState>
            )}
            {activeTasks.map((task) => (
              <article key={task.id} className="rounded-md border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{task.user_display_name ?? task.user_name}</span>
                      <ClientPill client={task.client} />
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{task.intent}</p>
                  </div>
                  <LiveDot />
                </div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div>
                    <Link href={`/projects/${task.project_id}`} className="hover:text-foreground hover:underline">
                      {task.project_name ?? "project"}
                    </Link>
                    {" · started "}
                    {formatRelativeTime(task.started_at)}
                  </div>
                  <div>
                    heartbeat {formatRelativeTime(task.heartbeat_at)}
                    {task.branch && ` · ${task.branch}`}
                  </div>
                  {task.files_touched.length > 0 && (
                    <div>{plural(task.files_touched.length, "file")} touched</div>
                  )}
                </div>
              </article>
            ))}
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function timestamp(value: Date | string | null): number {
  if (!value) return 0;
  return typeof value === "string" ? new Date(value).getTime() : value.getTime();
}

function plural(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-card p-4">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase text-muted-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function RolePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
      {children}
    </span>
  );
}

function LivePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-400">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const classes =
    status === "active"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : status === "done"
        ? "bg-muted text-muted-foreground"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${classes}`}>
      {status}
    </span>
  );
}

function ClientPill({ client }: { client: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
      {client}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-green-500" aria-label="active" />
  );
}
