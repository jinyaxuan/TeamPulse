import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { RiskBadge, StatusBadge } from "@/components/ui/status-badge";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { db, devices, projects, tasks, users } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { visibleTasksCondition } from "@/lib/project-access";
import { getInstancePlan } from "@/lib/subscription";
import { findActiveTaskOverlaps } from "@/lib/task-overlap";
import { nonTestProjectCondition, nonTestUserCondition } from "@/lib/test-data";
import { clientLabel, formatRelativeTime, taskStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const taskVisibility = visibleTasksCondition(user);

  const activeTasks = await db
    .select({
      id: tasks.id,
      task_id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      intent: tasks.intent,
      client: tasks.client,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      started_at: tasks.startedAt,
      heartbeat_at: tasks.heartbeatAt,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeCutoff),
        nonTestProjectCondition(),
        nonTestUserCondition(),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .orderBy(desc(tasks.heartbeatAt))
    .limit(40);

  const myActive = activeTasks.filter((task) => task.user_id === user.id);
  const teamRecent = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      intent: tasks.intent,
      status: tasks.status,
      branch: tasks.branch,
      started_at: tasks.startedAt,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        gt(tasks.startedAt, recentCutoff),
        nonTestProjectCondition(),
        nonTestUserCondition(),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .orderBy(desc(tasks.startedAt))
    .limit(20);

  const plan = await getInstancePlan();
  const [{ memberCount }] = await db.select({ memberCount: count() }).from(users).where(isNull(users.revokedAt));
  const [{ projectCount }] = await db.select({ projectCount: count() }).from(projects);
  const [{ deviceCount }] = await db.select({ deviceCount: count() }).from(devices).where(eq(devices.status, "active"));
  const [{ userDeviceCount }] = await db
    .select({ userDeviceCount: count() })
    .from(devices)
    .where(and(eq(devices.userId, user.id), eq(devices.status, "active")));
  const [{ userTaskCount }] = await db.select({ userTaskCount: count() }).from(tasks).where(eq(tasks.userId, user.id));

  const activePeople = new Set(activeTasks.map((task) => task.user_id)).size;
  const activeProjects = groupProjectHotspots(activeTasks);
  const projectIdByTask = new Map(activeTasks.map((task) => [task.id, task.project_id]));
  const touchedFiles = activeTasks.reduce((sum, task) => sum + task.files_touched.length, 0);
  const overlaps = findActiveTaskOverlaps(activeTasks);
  const highRiskCount = overlaps.filter((overlap) => overlap.severity === "high").length;
  const completedRecent = teamRecent.filter((task) => task.status === "done").length;
  const attentionLabel = highRiskCount > 0 ? `${highRiskCount} 个高风险` : overlaps.length > 0 ? `${overlaps.length} 个待确认` : "无冲突";

  return (
    <AppShell user={user} activeNav="home">
      <Workspace>
        <PageHeader
          variant="marvis"
          eyebrow="团队 Agent 指挥台"
          title="团队 Agent 随时在线"
          description="谁在执行、碰了哪些文件、哪里可能撞车，一屏看清后再进入项目协调。"
          actions={
            <>
              <ActionLink href="/team" variant="primary">查看团队态势</ActionLink>
              <ActionLink href="/settings/connect">接入 Agent</ActionLink>
            </>
          }
          meta={
            <div className="flex snap-x gap-3 overflow-x-auto pb-1 text-xs text-muted-foreground sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
              <CommandMeta label="当前账号" value={user.displayName ?? user.name} />
              <CommandMeta label="活跃项目" value={`${activeProjects.length} 个`} />
              <CommandMeta label="文件触达" value={`${touchedFiles} 条路径`} />
              <CommandMeta label="关注项" value={attentionLabel} />
            </div>
          }
        />

        <AgentStage
          activeTasks={activeTasks}
          activeProjects={activeProjects}
          overlaps={overlaps}
          touchedFiles={touchedFiles}
          attentionLabel={attentionLabel}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="在线成员" value={activePeople} detail="15 分钟内仍有任务心跳" tone="online" />
          <MetricCard label="活跃任务" value={activeTasks.length} detail={`${myActive.length} 个属于当前账号`} tone="agent" />
          <MetricCard label="冲突预警" value={overlaps.length} detail={highRiskCount > 0 ? `${highRiskCount} 个高风险文件重叠` : "当前没有高风险"} tone={overlaps.length > 0 ? "risk" : "online"} />
          <MetricCard label="24h 动态" value={teamRecent.length} detail={`${completedRecent} 个已完成`} tone="warning" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Panel
              title="冲突预警"
              description="同文件、同分支或跨分支同路径会进入这里。"
              actions={<ActionLink href="/projects">进入项目</ActionLink>}
            >
              {overlaps.length === 0 ? (
                <EmptyPanel>当前没有检测到活跃任务冲突。保持 Agent 心跳和文件触达上报即可。</EmptyPanel>
              ) : (
                <div className="space-y-2">
                  {overlaps.slice(0, 5).map((overlap) => (
                    <Link
                      key={overlap.key}
                      href={`/projects/${projectIdByTask.get(overlap.first.task_id) ?? ""}`}
                      className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <RiskBadge severity={overlap.severity}>
                              {overlap.severity === "high" ? "高风险" : "待确认"}
                            </RiskBadge>
                            <span className="text-sm font-medium">
                              {displayName(overlap.first)} / {displayName(overlap.second)}
                            </span>
                          </div>
                          <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                            {overlap.first.intent} 与 {overlap.second.intent}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground md:text-right">
                          <div>{overlapReasonText(overlap.reasons)}</div>
                          <div className="mt-1">{overlap.overlapping_files.length} 条重叠路径</div>
                        </div>
                      </div>
                      {overlap.overlapping_files.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {overlap.overlapping_files.slice(0, 4).map((file) => (
                            <MonoPath key={file} className="rounded-full bg-surface px-2.5 py-1">
                              {file}
                            </MonoPath>
                          ))}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="活跃任务矩阵" description="按心跳排序，优先显示正在改动的工作。">
              {activeTasks.length === 0 ? (
                <EmptyPanel>当前没有实时任务。在 Codex 或 Claude Code 中启动任务后会自动出现。</EmptyPanel>
              ) : (
                <>
                  <div className="space-y-2 lg:hidden">
                    {activeTasks.slice(0, 10).map((task) => (
                      <Link
                        key={task.id}
                        href={`/projects/${task.project_id}`}
                        className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]"
                      >
                        <div className="line-clamp-2 text-sm font-medium">{task.intent}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StatusBadge tone="agent">{clientLabel(task.client)}</StatusBadge>
                          <StatusBadge>{task.files_touched.length > 0 ? `${task.files_touched.length} 路径` : "未上报文件"}</StatusBadge>
                        </div>
                        <div className="mt-2 text-xs leading-5 text-muted-foreground">
                          {task.user_display_name ?? task.user_name} · {task.project_name ?? "项目"} · {formatRelativeTime(task.heartbeat_at)}
                        </div>
                        <MonoPath className="mt-1 rounded-full bg-surface px-2.5 py-1">
                          {task.branch || "未检测分支"}
                        </MonoPath>
                      </Link>
                    ))}
                  </div>
                  <div className="hidden overflow-x-auto rounded-[22px] bg-white lg:block">
                    <table className="min-w-[760px] w-full text-sm">
                    <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">任务</th>
                        <th className="px-3 py-2">成员 / Agent</th>
                        <th className="px-3 py-2">分支</th>
                        <th className="px-3 py-2">文件</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 bg-white">
                      {activeTasks.slice(0, 10).map((task) => (
                        <tr key={task.id} className="hover:bg-surface">
                          <td className="min-w-0 px-3 py-3">
                            <div className="line-clamp-2 font-medium">{task.intent}</div>
                            <Link href={`/projects/${task.project_id}`} className="mt-1 block truncate text-xs text-muted-foreground hover:text-foreground hover:underline">
                              {task.project_name ?? "项目"} · {formatRelativeTime(task.heartbeat_at)}
                            </Link>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium">{task.user_display_name ?? task.user_name}</div>
                            <StatusBadge tone="agent">{clientLabel(task.client)}</StatusBadge>
                          </td>
                          <td className="px-3 py-3">
                            <MonoPath>{task.branch || "未检测"}</MonoPath>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {task.files_touched.length > 0 ? `${task.files_touched.length} 条路径` : "未上报"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </Panel>
          </div>

          <aside className="space-y-6">
            <Panel title="项目热区" description="当前活跃任务最多的仓库。">
              {activeProjects.length === 0 ? (
                <EmptyPanel>暂无活跃项目。</EmptyPanel>
              ) : (
                <div className="space-y-2">
                  {activeProjects.slice(0, 6).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{project.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {project.people.size} 位成员 · {project.files} 条文件触达
                          </div>
                        </div>
                        <StatusBadge tone={project.count > 1 ? "warning" : "online"}>
                          {project.count} 任务
                        </StatusBadge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="我的任务" description="当前账号正在运行的 Agent 工作。">
              {myActive.length === 0 ? (
                <EmptyPanel action={<ActionLink href="/help">查看启动方式</ActionLink>}>
                  你当前没有进行中的任务。
                </EmptyPanel>
              ) : (
                <div className="space-y-2">
                  {myActive.map((task) => (
                    <Link key={task.id} href={`/projects/${task.project_id}`} className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]">
                      <div className="line-clamp-2 text-sm font-medium">{task.intent}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StatusBadge tone="online" dot>进行中</StatusBadge>
                        <StatusBadge>{task.branch || "未检测分支"}</StatusBadge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="系统容量" description={`${plan.name} · 协作资源用量`}>
              <div className="space-y-3">
                <UsageBar label="成员" current={memberCount} limit={plan.maxMembers} />
                <UsageBar label="项目" current={projectCount} limit={plan.maxProjects} />
                <UsageBar label="活跃 Agent" current={deviceCount} limit={plan.maxDevicesPerUser * memberCount} />
                <ActionLink href="/settings/billing" className="w-full">管理套餐</ActionLink>
              </div>
            </Panel>
          </aside>
        </section>

        <OnboardingChecklist user={user} hasDevice={userDeviceCount > 0} hasTask={userTaskCount > 0} />

        <Panel
          title="团队动态"
          description="最近 24 小时启动的任务，作为审计线索保留。"
          actions={<ActionLink href="/activity">筛选动态</ActionLink>}
        >
          {teamRecent.length === 0 ? (
            <EmptyPanel>暂时没有团队动态。成员可以先到“我的接入”绑定自己的 Agent。</EmptyPanel>
          ) : (
            <ul className="divide-y divide-black/5 overflow-hidden rounded-[22px] bg-white">
              {teamRecent.map((task) => (
                <li key={task.id} className="grid gap-2 px-3 py-3 text-sm transition hover:bg-surface md:grid-cols-[minmax(0,1fr)_220px_120px] md:items-center">
                  <div className="min-w-0">
                    <div className="truncate">
                      <span className="font-medium">{task.user_display_name ?? task.user_name}</span>
                      <span className="text-muted-foreground"> · {task.intent}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {task.branch ? `分支 ${task.branch}` : "未检测到分支"} · {formatRelativeTime(task.started_at)}
                    </div>
                  </div>
                  <Link href={`/projects/${task.project_id}`} className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline">
                    {task.project_name ?? "项目"}
                  </Link>
                  <StatusBadge tone={task.status === "active" ? "online" : task.status === "done" ? "slate" : "warning"}>
                    {taskStatusLabel(task.status)}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Workspace>
    </AppShell>
  );
}

function CommandMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[180px] snap-start items-center justify-between gap-3 rounded-full border border-black/10 bg-white/70 px-3 py-2 sm:min-w-0">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function AgentStage({
  activeTasks,
  activeProjects,
  overlaps,
  touchedFiles,
  attentionLabel,
}: {
  activeTasks: Array<{
    id: string;
    intent: string;
    client: string;
    branch: string | null;
    files_touched: string[];
    user_name: string;
    user_display_name: string | null;
  }>;
  activeProjects: Array<{ id: string; name: string; count: number; files: number; people: Set<string> }>;
  overlaps: Array<{ key: string; severity: "none" | "medium" | "high"; overlapping_files: string[] }>;
  touchedFiles: number;
  attentionLabel: string;
}) {
  const leadTask = activeTasks[0];
  const leadProject = activeProjects[0];
  const workstations = [
    {
      label: "当前任务",
      value: activeTasks.length > 0 ? `${activeTasks.length} 个任务` : "待接入",
      tone: activeTasks.length > 0 ? "online" : "slate",
    },
    {
      label: "项目热区",
      value: leadProject ? leadProject.name : "暂无热区",
      tone: "agent",
    },
    {
      label: "风险观察",
      value: overlaps.length > 0 ? `${overlaps.length} 个预警` : "无冲突",
      tone: overlaps.length > 0 ? "risk" : "online",
    },
    {
      label: "文件触达",
      value: `${touchedFiles} 条路径`,
      tone: "slate",
    },
    {
      label: "协作成员",
      value: leadTask ? leadTask.user_display_name ?? leadTask.user_name : "等待心跳",
      tone: "agent",
    },
    {
      label: "同步状态",
      value: "持续观察",
      tone: "online",
    },
  ] as const;

  return (
    <section className="tp-marvis-stage overflow-hidden rounded-[32px]">
      <div className="px-5 py-7 text-center sm:px-8 sm:py-8">
        <div className="mx-auto w-fit rounded-full bg-black px-5 py-2 text-sm font-medium text-white shadow-[0_18px_34px_-24px_rgba(0,0,0,0.9)]">
          TeamPulse 协作舞台
        </div>
        <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold text-foreground sm:text-4xl">
          把团队 Agent 排成一张可接管的行动图
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          像 Marvis 管电脑任务一样，TeamPulse 管团队 Agent：当前任务、文件触达、项目热区和冲突风险都在一个轻量舞台里。
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <StatusBadge tone={overlaps.length > 0 ? "risk" : "online"} dot>
            {attentionLabel}
          </StatusBadge>
          <StatusBadge tone="agent">{touchedFiles} 条文件触达</StatusBadge>
          <StatusBadge>{activeProjects.length} 个项目热区</StatusBadge>
        </div>

        <div className="mx-auto mt-6 max-w-5xl rounded-[28px] bg-[#f5f5f2] p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workstations.map((item) => (
              <div
                key={item.label}
                className="rounded-[24px] bg-white/90 p-3 text-left shadow-[0_16px_38px_-32px_rgba(0,0,0,0.45)] sm:p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">{item.label}</div>
                  <StatusBadge tone={item.tone} dot={item.tone === "online" || item.tone === "risk"}>
                    {item.tone === "risk" ? "需看" : item.tone === "online" ? "在线" : "状态"}
                  </StatusBadge>
                </div>
                <div className="mt-2 truncate text-sm text-muted-foreground">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-[24px] bg-white p-3 text-left shadow-[0_18px_46px_-34px_rgba(0,0,0,0.4)] sm:p-4">
              <div className="text-xs font-semibold text-muted-foreground">当前任务</div>
              {leadTask ? (
                <>
                  <div className="mt-3 line-clamp-2 text-sm font-semibold">{leadTask.intent}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusBadge tone="agent">{clientLabel(leadTask.client)}</StatusBadge>
                    <StatusBadge>{leadTask.branch || "未检测分支"}</StatusBadge>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {leadTask.user_display_name ?? leadTask.user_name} · {leadTask.files_touched.length} 条路径
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm leading-6 text-muted-foreground">当前没有实时任务，等待 Agent 接入。</div>
              )}
            </div>

            <div className="rounded-[24px] bg-white p-3 text-left shadow-[0_18px_46px_-34px_rgba(0,0,0,0.4)] sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-muted-foreground">风险与文件</div>
                <StatusBadge tone={overlaps.some((item) => item.severity === "high") ? "risk" : "online"}>
                  {overlaps.length > 0 ? "需协调" : "清爽"}
                </StatusBadge>
              </div>
              <div className="mt-4 space-y-2">
                {(overlaps.length > 0 ? overlaps.slice(0, 3) : [{ key: "clear", severity: "none" as const, overlapping_files: [] }]).map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-full bg-surface px-3 py-2 text-xs">
                    <span className="font-medium">
                      {item.severity === "high" ? "高风险冲突" : item.severity === "medium" ? "待确认重叠" : "没有文件冲突"}
                    </span>
                    <span className="text-muted-foreground">
                      {item.overlapping_files.length} 条路径
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UsageBar({ label, current, limit }: { label: string; current: number; limit: number }) {
  const isUnlimited = limit >= 999999;
  const pct = isUnlimited ? 0 : Math.min((current / Math.max(limit, 1)) * 100, 100);
  const isWarning = !isUnlimited && pct >= 80;
  const isFull = !isUnlimited && pct >= 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={isFull ? "font-medium text-risk" : isWarning ? "text-warning" : "text-muted-foreground"}>
          {current} / {isUnlimited ? "\u221e" : limit}
        </span>
      </div>
      {!isUnlimited && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${isFull ? "bg-risk" : isWarning ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function groupProjectHotspots(
  rows: Array<{
    project_id: string;
    project_name: string | null;
    user_id: string;
    files_touched: string[];
  }>
) {
  const map = new Map<string, { id: string; name: string; count: number; files: number; people: Set<string> }>();
  for (const row of rows) {
    const current = map.get(row.project_id) ?? {
      id: row.project_id,
      name: row.project_name ?? "未命名项目",
      count: 0,
      files: 0,
      people: new Set<string>(),
    };
    current.count += 1;
    current.files += row.files_touched.length;
    current.people.add(row.user_id);
    map.set(row.project_id, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || b.files - a.files);
}

function displayName(task: { user_display_name: string | null; user_name: string }) {
  return task.user_display_name ?? task.user_name;
}

function overlapReasonText(reasons: string[]) {
  const labels = [];
  if (reasons.includes("files")) labels.push("同文件");
  if (reasons.includes("branch")) labels.push("同分支");
  if (reasons.includes("merge_risk")) labels.push("跨分支同路径");
  return labels.join(" / ") || "待确认";
}
