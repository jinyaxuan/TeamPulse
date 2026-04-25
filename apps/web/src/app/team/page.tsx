import { and, count, desc, eq, gt, gte, isNull, max, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { nonTestProjectCondition, nonTestUserCondition } from "@/lib/test-data";
import { clientLabel, formatRelativeTime, roleLabel, taskStatusLabel } from "@/lib/utils";

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
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(and(isNull(users.revokedAt), nonTestUserCondition(), nonTestProjectCondition()))
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
    .where(
      and(
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeCutoff),
        isNull(users.revokedAt),
        nonTestProjectCondition(),
        nonTestUserCondition()
      )
    )
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
    .where(
      and(
        gte(tasks.startedAt, since),
        isNull(users.revokedAt),
        nonTestProjectCondition(),
        nonTestUserCondition()
      )
    )
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
        <header className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">团队</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看谁正在工作、正在处理什么，以及最近 7 天的团队产出。
            </p>
          </div>
          <Link
            href="/activity"
            className="w-fit rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
          >
            查看完整动态
          </Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="团队成员" value={memberStats.length} detail={`${activeMembers} 人正在活跃`} tone="blue" />
          <MetricCard label="实时任务" value={activeTasks.length} detail="15 分钟内有心跳" tone="green" />
          <MetricCard label="7 天任务" value={totalTasks} detail={`${completedTasks} 个已完成`} tone="slate" />
          <MetricCard label="近期事件" value={recentTasks.length} detail="统计最近 100 条记录" tone="amber" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <SectionHeader title="成员" description="按实时活跃优先排序，其次按最近心跳排序。" />
            {memberStats.length === 0 && (
              <EmptyState>还没有团队成员。</EmptyState>
            )}
            {memberStats.map((m) => {
              const pct = Math.round((Number(m.task_count) / maxCount) * 100);
              const latest = latestByUser.get(m.id);
              const activeNow = activeCountByUser.get(m.id) ?? 0;
              return (
                <article key={m.id} className="rounded-lg border bg-white p-4 shadow-sm transition hover:border-slate-300">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                        {(m.display_name ?? m.name).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.display_name ?? m.name}</span>
                        <span className="text-xs text-muted-foreground">@{m.name}</span>
                        {m.role === "admin" && <RolePill>{roleLabel(m.role)}</RolePill>}
                        {activeNow > 0 && <LivePill>{activeNow} 个实时任务</LivePill>}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        7 天内 {Number(m.task_count)} 个任务
                        {m.last_active && ` · 最近活跃 ${formatRelativeTime(m.last_active)}`}
                      </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-2 text-xs text-muted-foreground">
                      <span>{Number(m.done_count)} 已完成</span>
                      <span>{Number(m.abandoned_count)} 已中断</span>
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-slate-900" style={{ width: `${pct}%` }} />
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
                        {latest.project_name ?? "项目"} · {formatRelativeTime(latest.started_at)}
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                      最近 7 天没有任务。
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <aside className="space-y-3">
            <SectionHeader title="实时进行中" description="当前仍在持续上报心跳的任务。" />
            {activeTasks.length === 0 && (
              <EmptyState>当前没有实时任务。</EmptyState>
            )}
            {activeTasks.map((task) => (
              <article key={task.id} className="rounded-lg border border-l-4 border-l-emerald-500 bg-white p-4 shadow-sm">
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
                      {task.project_name ?? "项目"}
                    </Link>
                    {" · 开始于 "}
                    {formatRelativeTime(task.started_at)}
                  </div>
                  <div>
                    心跳 {formatRelativeTime(task.heartbeat_at)}
                    {task.branch && ` · 分支：${task.branch}`}
                  </div>
                  {task.files_touched.length > 0 && (
                    <div>已触碰 {task.files_touched.length} 个文件</div>
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

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "green" | "slate" | "amber";
}) {
  const toneClass =
    tone === "blue"
      ? "border-t-blue-500"
      : tone === "green"
        ? "border-t-emerald-500"
        : tone === "amber"
          ? "border-t-amber-500"
          : "border-t-slate-400";

  return (
    <div className={`rounded-lg border border-t-4 bg-white p-4 shadow-sm ${toneClass}`}>
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
    <div className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
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
      {taskStatusLabel(status)}
    </span>
  );
}

function ClientPill({ client }: { client: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
      {clientLabel(client)}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-green-500" aria-label="进行中" />
  );
}
