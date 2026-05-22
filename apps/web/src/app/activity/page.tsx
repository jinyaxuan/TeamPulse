import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
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
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">团队动态</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              查看任务历史，按成员、项目、状态和时间范围筛选。
            </p>
          </div>
          <Link
            href={`/api/v1/activity/export?${csvQuery}`}
            className="w-fit rounded-md border bg-white px-3 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
          >
            导出 CSV
          </Link>
        </div>

        <section className="grid gap-3 sm:grid-cols-4">
          <ActivityStat label="当前结果" value={rows.length} detail={`最近 ${days} 天`} tone="slate" />
          <ActivityStat label="进行中" value={activeRows} detail="仍在上报心跳" tone="green" />
          <ActivityStat label="已完成" value={doneRows} detail="正常结束的任务" tone="blue" />
          <ActivityStat label="已中断" value={abandonedRows} detail="未正常收尾" tone="amber" />
        </section>

        <FilterBar current={{ ...params, days: String(days) }} projects={projectOptions} showTestData={showTestData} />

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase text-muted-foreground">动态列表</h2>
            <span className="text-xs text-muted-foreground">最多显示 200 条</span>
          </div>
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          {rows.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              没有符合筛选条件的动态。
            </div>
          )}
          <ul className="divide-y">
            {rows.map((t) => (
              <li
                key={t.id}
                className="grid gap-3 px-4 py-3 text-sm transition hover:bg-slate-50 lg:grid-cols-[120px_minmax(0,1fr)_180px_88px] lg:items-start"
              >
                <div className="text-xs text-muted-foreground">
                  {formatDateTime(t.started_at)}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {clientLabel(t.client)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-muted-foreground">
                    {t.intent}
                  </div>
                  {t.branch && (
                    <div className="font-mono text-xs text-muted-foreground">分支：{t.branch}</div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {t.status === "active" && <span>心跳 {formatRelativeTime(t.heartbeat_at)}</span>}
                    {t.ended_at && <span>结束 {formatDateTime(t.ended_at)}</span>}
                    <span>{t.files_touched.length} 条路径</span>
                  </div>
                  {t.files_touched.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {t.files_touched.slice(0, 3).map((file) => (
                        <span
                          key={file}
                          className="max-w-[18rem] truncate rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600"
                          title={file}
                        >
                          {file}
                        </span>
                      ))}
                      {t.files_touched.length > 3 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          +{t.files_touched.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                  {t.summary && (
                    <div className="mt-1 line-clamp-2 rounded border bg-muted/40 p-2 text-xs leading-5 text-muted-foreground">
                      {t.summary}
                    </div>
                  )}
                </div>
                <Link
                  href={`/projects/${t.project_id}`}
                  className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t.project_name ?? "项目"}
                </Link>
                <div
                  className={
                    "h-fit w-16 flex-shrink-0 self-start rounded-full px-2 py-0.5 text-center text-xs lg:self-center " +
                    (t.status === "active"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : t.status === "done"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400")
                  }
                >
                  {taskStatusLabel(t.status)}
                </div>
              </li>
            ))}
          </ul>
        </div>
        </section>
      </div>
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
    <div className={`rounded-lg border border-t-4 bg-white p-4 shadow-sm ${toneClass}`}>
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
    <form action="/activity" method="get" className="rounded-lg border bg-white p-4 shadow-sm">
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
          className="rounded-md border border-input bg-background px-3 py-2"
        />
        <select
          name="project"
          defaultValue={current.project ?? ""}
          className="rounded-md border border-input bg-background px-3 py-2"
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
          className="rounded-md border border-input bg-background px-3 py-2"
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
          className="rounded-md border border-input bg-background px-3 py-2"
        >
          <option value="">全部状态</option>
          <option value="active">只看进行中</option>
          <option value="done">只看已完成</option>
          <option value="abandoned">只看已中断</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
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
