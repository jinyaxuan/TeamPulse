import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { ActionLink } from "@/components/ui/action-link";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskSummaryBox } from "@/components/ui/task-summary-box";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { getSessionUser } from "@/lib/auth";
import { visibleProjectsCondition, visibleTasksCondition } from "@/lib/project-access";
import {
  nonTestProjectCondition,
  nonTestUserCondition,
  shouldShowTestData,
  SHOW_TEST_DATA_PARAM,
} from "@/lib/test-data";
import { clientLabel, formatDateTime, formatRelativeTime, taskStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = {
  user?: string;
  project?: string;
  days?: string;
  status?: string;
  showTestData?: string;
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
  const showTestData = shouldShowTestData(params.showTestData);

  const conditions: SQL[] = [gte(tasks.startedAt, since)];
  const taskVisibility = visibleTasksCondition(sessionUser);
  if (taskVisibility) conditions.push(taskVisibility);
  if (params.project) conditions.push(eq(tasks.projectId, params.project));
  if (!showTestData) {
    conditions.push(nonTestProjectCondition(), nonTestUserCondition());
  }
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
      client: tasks.client,
      intent: tasks.intent,
      summary: tasks.summary,
      status: tasks.status,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      heartbeat_at: tasks.heartbeatAt,
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

  const activeRows = rows.filter((row) => row.status === "active").length;
  const doneRows = rows.filter((row) => row.status === "done").length;
  const abandonedRows = rows.filter((row) => row.status === "abandoned").length;

  const projectOptionsQuery = db
    .select({ id: projects.id, display_name: projects.displayName })
    .from(projects);
  const projectOptionConditions: SQL[] = [];
  if (!showTestData) projectOptionConditions.push(nonTestProjectCondition());
  const projectVisibility = visibleProjectsCondition(sessionUser);
  if (projectVisibility) projectOptionConditions.push(projectVisibility);
  const projectOptions = await (projectOptionConditions.length > 0
    ? projectOptionsQuery.where(and(...projectOptionConditions))
    : projectOptionsQuery
  ).orderBy(projects.displayName);

  // Build an export CSV link that preserves current filters.
  const csvQuery = new URLSearchParams({
    days: String(days),
    ...(params.user ? { user: params.user } : {}),
    ...(params.project ? { project: params.project } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(showTestData ? { [SHOW_TEST_DATA_PARAM]: "1" } : {}),
    format: "csv",
  }).toString();

  return (
    <AppShell user={sessionUser} activeNav="activity">
      <Workspace>
        <PageHeader
          eyebrow="任务时间线"
          title="团队动态"
          description="查看任务历史，按成员、项目、状态和时间范围筛选；重点先看状态、路径和交接摘要。"
          actions={
            <>
              <ActionLink href="/team">团队视图</ActionLink>
              <ActionLink href={`/api/v1/activity/export?${csvQuery}`} variant="primary">导出 CSV</ActionLink>
            </>
          }
        />

        <section className="tp-reveal-list grid gap-3 sm:grid-cols-4">
          <ActivityStat label="当前结果" value={rows.length} detail={`最近 ${days} 天`} tone="slate" />
          <ActivityStat label="进行中" value={activeRows} detail="仍在上报心跳" tone="green" />
          <ActivityStat label="已完成" value={doneRows} detail="正常结束的任务" tone="blue" />
          <ActivityStat label="已中断" value={abandonedRows} detail="未正常收尾" tone="amber" />
        </section>

        <FilterBar current={{ ...params, days: String(days) }} projects={projectOptions} showTestData={showTestData} />

        <Panel
          title="动态列表"
          description="最多显示 200 条，按启动时间倒序排列。"
          bodyClassName="p-3 sm:p-4"
        >
          {rows.length === 0 ? (
            <EmptyPanel>没有符合筛选条件的动态。</EmptyPanel>
          ) : (
            <div className="tp-reveal-list space-y-3">
              {rows.map((t) => (
                <article key={t.id} className="tp-list-card p-4">
                  <div className="grid gap-4 lg:grid-cols-[128px_minmax(0,1fr)_220px] lg:items-start">
                    <div className="text-xs text-muted-foreground">
                      <div className="font-mono text-foreground">{formatDateTime(t.started_at)}</div>
                      <div className="mt-1">{formatRelativeTime(t.started_at)}</div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                        <StatusBadge tone="agent">{clientLabel(t.client)}</StatusBadge>
                        <StatusBadge tone={statusTone(t.status)} dot={t.status === "active"}>
                          {taskStatusLabel(t.status)}
                        </StatusBadge>
                      </div>
                      <h2 className="mt-2 text-sm font-medium leading-6 text-foreground">{t.intent}</h2>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {t.branch && <MonoPath>分支 {t.branch}</MonoPath>}
                        {t.status === "active" && <span>心跳 {formatRelativeTime(t.heartbeat_at)}</span>}
                        {t.ended_at && <span>结束 {formatDateTime(t.ended_at)}</span>}
                        <span>{t.files_touched.length} 条路径</span>
                      </div>
                      {t.files_touched.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.files_touched.slice(0, 4).map((file) => (
                            <MonoPath key={file} className="max-w-full rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-black/[0.04]">
                              {file}
                            </MonoPath>
                          ))}
                          {t.files_touched.length > 4 && (
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-black/[0.04]">
                              +{t.files_touched.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                      {t.summary && <TaskSummaryBox summary={t.summary} className="mt-3 bg-white/70" />}
                    </div>

                    <Link
                      href={`/projects/${t.project_id}`}
                      className="min-w-0 rounded-[18px] border border-black/[0.05] bg-white/70 px-3 py-3 text-xs text-muted-foreground transition hover:bg-white hover:text-foreground"
                    >
                      <span className="block text-muted-foreground">项目</span>
                      <span className="mt-1 block truncate font-medium text-foreground">{t.project_name ?? "项目"}</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </Workspace>
    </AppShell>
  );
}

function ActivityStat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "slate" | "green" | "blue" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "border-t-emerald-500"
      : tone === "blue"
        ? "border-t-blue-500"
        : tone === "amber"
          ? "border-t-amber-500"
          : "border-t-slate-400";

  return (
    <div className={`tp-panel rounded-[22px] border-t-4 p-4 ${toneClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function FilterBar({
  current,
  projects: projectOptions,
  showTestData,
}: {
  current: SearchParams;
  projects: Array<{ id: string; display_name: string | null }>;
  showTestData: boolean;
}) {
  return (
    <form action="/activity" method="get" className="tp-panel rounded-[24px] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">筛选条件</h2>
          <p className="mt-1 text-xs text-muted-foreground">组合成员、项目、时间和状态来定位任务。</p>
        </div>
        <Link href="/activity" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          清空筛选
        </Link>
      </div>
      <div className="grid gap-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_160px_auto]">
        <input
          name="user"
          placeholder="成员用户名，例如 alice"
          defaultValue={current.user ?? ""}
          className="tp-input"
        />
        <select
          name="project"
          defaultValue={current.project ?? ""}
          className="tp-input"
        >
          <option value="">全部项目</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.display_name ?? "未命名项目"}
            </option>
          ))}
        </select>
        <select
          name="days"
          defaultValue={current.days ?? "7"}
          className="tp-input"
        >
          <option value="1">最近 24 小时</option>
          <option value="3">最近 3 天</option>
          <option value="7">最近 7 天</option>
          <option value="14">最近 2 周</option>
          <option value="30">最近 30 天</option>
        </select>
        <select
          name="status"
          defaultValue={current.status ?? ""}
          className="tp-input"
        >
          <option value="">全部状态</option>
          <option value="active">只看进行中</option>
          <option value="done">只看已完成</option>
          <option value="abandoned">只看已中断</option>
        </select>
        <button
          type="submit"
          className="rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-[0_14px_32px_-22px_rgba(15,23,42,0.9)] transition active:translate-y-px hover:bg-black/80"
        >
          应用筛选
        </button>
      </div>
      <label className="mt-3 flex w-fit items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          name={SHOW_TEST_DATA_PARAM}
          value="1"
          defaultChecked={showTestData}
          className="h-4 w-4 rounded border-input"
        />
        显示 e2e 测试数据
      </label>
      {!showTestData && (
        <p className="mt-2 text-xs text-muted-foreground">
          已默认隐藏测试项目和测试成员，避免自动化记录干扰真实团队动态。
        </p>
      )}
    </form>
  );
}

function statusTone(status: string): "slate" | "online" | "warning" {
  if (status === "active") return "online";
  if (status === "abandoned") return "warning";
  return "slate";
}
