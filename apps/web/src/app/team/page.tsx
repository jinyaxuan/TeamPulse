import { and, count, desc, eq, gt, gte, inArray, isNull, max, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { db, devices, projects, tasks, users } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { listVisibleProjectMemberUserIds, visibleTasksCondition } from "@/lib/project-access";
import {
  nonTestProjectCondition,
  nonTestUserCondition,
  shouldShowTestData,
  SHOW_TEST_DATA_PARAM,
} from "@/lib/test-data";
import { clientLabel, formatRelativeTime, roleLabel, taskStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const query = await searchParams;
  const includeTestData = shouldShowTestData(firstSearchParam(query[SHOW_TEST_DATA_PARAM]));
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const taskVisibility = visibleTasksCondition(sessionUser);
  const visibleMemberIds = await listVisibleProjectMemberUserIds(sessionUser);
  const memberVisibility =
    visibleMemberIds === null ? undefined : inArray(users.id, Array.from(visibleMemberIds));

  const activeDeviceRows = await db
    .select({
      user_id: devices.userId,
      active_device_count: count(devices.id),
    })
    .from(devices)
    .where(eq(devices.status, "active"))
    .groupBy(devices.userId);
  const activeDeviceCountByUser = new Map(
    activeDeviceRows
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, Number(row.active_device_count)])
  );

  const rawMemberStats = await db
    .select({
      id: users.id,
      name: users.name,
      display_name: users.displayName,
      role: users.role,
      task_count: count(tasks.id),
      done_count: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'done')::int`.as("done_count"),
      abandoned_count: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'abandoned')::int`.as("abandoned_count"),
      last_active: max(tasks.heartbeatAt),
    })
    .from(users)
    .leftJoin(
      tasks,
      and(eq(tasks.userId, users.id), gte(tasks.startedAt, since), ...(taskVisibility ? [taskVisibility] : []))
    )
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        isNull(users.revokedAt),
        ...(includeTestData ? [] : [nonTestUserCondition(), nonTestProjectCondition()]),
        ...(memberVisibility ? [memberVisibility] : [])
      )
    )
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
        ...(includeTestData ? [] : [nonTestProjectCondition(), nonTestUserCondition()]),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .orderBy(desc(tasks.heartbeatAt))
    .limit(30);

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
        ...(includeTestData ? [] : [nonTestProjectCondition(), nonTestUserCondition()]),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .orderBy(desc(tasks.startedAt))
    .limit(100);

  const activeCountByUser = new Map<string, number>();
  const fileCountByUser = new Map<string, number>();
  for (const task of activeTasks) {
    activeCountByUser.set(task.user_id, (activeCountByUser.get(task.user_id) ?? 0) + 1);
    fileCountByUser.set(task.user_id, (fileCountByUser.get(task.user_id) ?? 0) + task.files_touched.length);
  }

  const memberStats = rawMemberStats
    .filter((member) => {
      if (visibleMemberIds && !visibleMemberIds.has(member.id) && member.id !== sessionUser.id) return false;
      const hasRecentTasks = Number(member.task_count) > 0;
      const hasActiveDevice = (activeDeviceCountByUser.get(member.id) ?? 0) > 0;
      return member.id === sessionUser.id || hasRecentTasks || hasActiveDevice;
    })
    .sort((a, b) => {
      if (a.id === sessionUser.id) return -1;
      if (b.id === sessionUser.id) return 1;
      const activeDelta = (activeCountByUser.get(b.id) ?? 0) - (activeCountByUser.get(a.id) ?? 0);
      if (activeDelta !== 0) return activeDelta;
      return timestamp(b.last_active) - timestamp(a.last_active);
    });

  const latestByUser = new Map<string, (typeof recentTasks)[number]>();
  for (const task of recentTasks) {
    if (!latestByUser.has(task.user_id)) latestByUser.set(task.user_id, task);
  }

  const totalTasks = memberStats.reduce((sum, member) => sum + Number(member.task_count), 0);
  const completedTasks = memberStats.reduce((sum, member) => sum + Number(member.done_count), 0);
  const activeMembers = memberStats.filter((member) => (activeCountByUser.get(member.id) ?? 0) > 0).length;
  const activeAgents = Array.from(activeDeviceCountByUser.values()).reduce((sum, value) => sum + value, 0);

  return (
    <AppShell user={sessionUser} activeNav="team">
      <Workspace>
        <PageHeader
          eyebrow="Team Roster"
          title="团队与 Agent"
          description="按成员查看 Agent、任务心跳和文件触达，先识别谁在工作，再决定是否进入项目协调。"
          actions={
            <>
              <ActionLink href="/activity">完整动态</ActionLink>
              <ActionLink href="/settings/connect" variant="primary">接入 Agent</ActionLink>
            </>
          }
          meta={
            <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <CommandMeta label="成员" value={`${memberStats.length} 人`} />
              <CommandMeta label="活跃成员" value={`${activeMembers} 人`} />
              <CommandMeta label="活跃 Agent" value={`${activeAgents} 个`} />
              <CommandMeta label="7 天完成" value={`${completedTasks}/${totalTasks}`} />
            </div>
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="团队成员" value={memberStats.length} detail={`${activeMembers} 人正在活跃`} tone="agent" />
          <MetricCard label="实时任务" value={activeTasks.length} detail="15 分钟内有心跳" tone="online" />
          <MetricCard label="活跃 Agent" value={activeAgents} detail="已绑定并可上报任务" tone="agent" />
          <MetricCard label="近期事件" value={recentTasks.length} detail="最近 7 天任务记录" tone="warning" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel title="成员作战序列" description="实时活跃优先，其次按最近心跳排序。" bodyClassName="p-0">
            {memberStats.length === 0 ? (
              <div className="p-4">
                <EmptyPanel>还没有团队成员。</EmptyPanel>
              </div>
            ) : (
              <div className="divide-y">
                {memberStats.map((member) => {
                  const latest = latestByUser.get(member.id);
                  const activeNow = activeCountByUser.get(member.id) ?? 0;
                  const activeDeviceCount = activeDeviceCountByUser.get(member.id) ?? 0;
                  const touchedFiles = fileCountByUser.get(member.id) ?? 0;
                  const name = member.display_name ?? member.name;
                  return (
                    <Link key={member.id} href={`/team/${member.id}`} className="block px-4 py-4 transition hover:bg-surface">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_160px_160px_minmax(0,1fr)] lg:items-center">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{name}</span>
                              {member.id === sessionUser.id && <StatusBadge tone="dark">我</StatusBadge>}
                              {member.role === "admin" && <StatusBadge tone="info">{roleLabel(member.role)}</StatusBadge>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <span>@{member.name}</span>
                              <span>{Number(member.task_count)} 个 7 天任务</span>
                              {member.last_active && <span>最近 {formatRelativeTime(member.last_active)}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <StatusBadge tone={activeNow > 0 ? "online" : "slate"} dot={activeNow > 0}>
                            {activeNow > 0 ? `${activeNow} 实时任务` : "空闲"}
                          </StatusBadge>
                          <StatusBadge tone="agent">{activeDeviceCount} Agent</StatusBadge>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          <div>{Number(member.done_count)} 已完成 / {Number(member.abandoned_count)} 中断</div>
                          <div className="mt-1">{touchedFiles} 条活跃文件触达</div>
                        </div>

                        <div className="min-w-0 text-sm">
                          {latest ? (
                            <>
                              <div className="truncate">
                                <StatusBadge tone={latest.status === "active" ? "online" : latest.status === "done" ? "slate" : "warning"}>
                                  {taskStatusLabel(latest.status)}
                                </StatusBadge>
                                <span className="ml-2 text-muted-foreground">{latest.intent}</span>
                              </div>
                              <div className="mt-1 truncate text-xs text-muted-foreground">
                                {latest.project_name ?? "项目"} · {formatRelativeTime(latest.started_at)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">最近 7 天没有任务。</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Panel>

          <aside className="space-y-6">
            <Panel title="实时进行中" description="当前仍在持续上报心跳的任务。">
              {activeTasks.length === 0 ? (
                <EmptyPanel>当前没有实时任务。</EmptyPanel>
              ) : (
                <div className="space-y-2">
                  {activeTasks.slice(0, 8).map((task) => (
                    <Link key={task.id} href={`/projects/${task.project_id}`} className="block rounded-md border bg-white p-3 transition hover:bg-surface">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{task.user_display_name ?? task.user_name}</span>
                            <StatusBadge tone="agent">{clientLabel(task.client)}</StatusBadge>
                          </div>
                          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{task.intent}</p>
                        </div>
                        <StatusBadge tone="online" dot>Live</StatusBadge>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <div>{task.project_name ?? "项目"} · 心跳 {formatRelativeTime(task.heartbeat_at)}</div>
                        <div>
                          <MonoPath>{task.branch || "未检测分支"}</MonoPath>
                          {task.files_touched.length > 0 && ` · ${task.files_touched.length} 个文件`}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </aside>
        </section>
      </Workspace>
    </AppShell>
  );
}

function CommandMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-white/70 px-3 py-2">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function timestamp(value: Date | string | null): number {
  if (!value) return 0;
  return typeof value === "string" ? new Date(value).getTime() : value.getTime();
}
