import { and, desc, eq, gt } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { nonTestProjectCondition, nonTestUserCondition } from "@/lib/test-data";
import { formatRelativeTime, taskStatusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const myActive = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      intent: tasks.intent,
      started_at: tasks.startedAt,
      branch: tasks.branch,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.userId, user.id),
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeCutoff),
        nonTestProjectCondition()
      )
    )
    .orderBy(desc(tasks.heartbeatAt))
    .limit(10);

  const teamRecent = await db
    .select({
      id: tasks.id,
      project_id: tasks.projectId,
      project_name: projects.displayName,
      intent: tasks.intent,
      status: tasks.status,
      started_at: tasks.startedAt,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(and(gt(tasks.startedAt, recentCutoff), nonTestProjectCondition(), nonTestUserCondition()))
    .orderBy(desc(tasks.startedAt))
    .limit(20);

  const activeTeamTasks = teamRecent.filter((t) => t.status === "active").length;
  const completedRecent = teamRecent.filter((t) => t.status === "done").length;
  const uniquePeople = new Set(teamRecent.map((t) => t.user_name)).size;
  const uniqueProjects = new Set(teamRecent.map((t) => t.project_id)).size;

  return (
    <AppShell user={user} activeNav="home">
      <div className="space-y-10">
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-medium uppercase text-muted-foreground">工作台</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-normal">今天团队在做什么</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  聚合你的当前任务、团队最近动态和项目入口，适合每天打开先扫一眼。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/team"
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
                >
                  查看团队视图
                </Link>
                <Link
                  href="/activity"
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  筛选动态
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <DashboardMetric label="我的进行中任务" value={myActive.length} detail="来自当前登录账号" tone="blue" />
            <DashboardMetric label="团队活跃任务" value={activeTeamTasks} detail="最近 24 小时内" tone="green" />
            <DashboardMetric label="参与项目" value={uniqueProjects} detail={`${uniquePeople} 位成员有动态`} tone="amber" />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <SectionTitle title={`我的进行中任务 (${myActive.length})`} description="心跳在 15 分钟内的任务会显示在这里。" />
            <div className="mt-3 space-y-2">
              {myActive.length === 0 && (
                <div className="rounded-lg border border-dashed bg-white p-6 text-sm leading-6 text-muted-foreground">
                  当前没有进行中的任务。在 Claude Code 或 Codex 里开始一次任务后会自动出现在这里。
                </div>
              )}
              {myActive.map((t) => (
                <div key={t.id} className="rounded-lg border bg-white p-4 shadow-sm transition hover:border-slate-300">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.intent}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        <Link
                          href={`/projects/${t.project_id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {t.project_name ?? "未命名项目"}
                        </Link>
                        {" · "}
                        {formatRelativeTime(t.started_at)}
                        {t.branch && ` · 分支：${t.branch}`}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                      进行中
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title="快速入口" description="常用的协作面板和管理入口。" />
            <div className="mt-3 grid gap-2">
              <QuickLink href="/projects" label="项目" title="项目列表" description="按仓库查看活跃任务和历史。" />
              <QuickLink href="/activity" label="动态" title="团队动态" description="筛选、审计和导出任务记录。" />
              <QuickLink href="/settings/connect" label="接入" title="我的接入" description="按当前账号绑定 Claude Code / Codex 设备。" />
              <QuickLink href="/settings/devices" label="设备" title="我的设备" description="查看并撤销个人插件设备。" />
              {user.role === "admin" && (
                <QuickLink href="/admin/devices" label="审批" title="设备审批" description="审批新接入的 Claude Code / Codex 设备。" />
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <SectionTitle title="团队动态 · 最近 24 小时" description="最近启动的任务按时间倒序排列。" />
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">进行中 {activeTeamTasks}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">已完成 {completedRecent}</span>
            </div>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border bg-white shadow-sm">
            {teamRecent.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                暂时没有团队动态。管理员可以先到设备审批页邀请成员接入。
              </div>
            )}
            <ul className="divide-y">
              {teamRecent.map((t) => (
                <li key={t.id} className="grid gap-2 px-4 py-3 text-sm transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_260px] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate">
                      <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                      <span className="text-muted-foreground"> — {t.intent}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.status === "active" ? "正在上报心跳" : `启动于 ${formatRelativeTime(t.started_at)}`}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:justify-end">
                    <Link
                      href={`/projects/${t.project_id}`}
                      className="truncate hover:text-foreground hover:underline"
                    >
                      {t.project_name ?? ""}
                    </Link>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 " +
                        (t.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : t.status === "done"
                            ? "bg-slate-100 text-slate-700"
                            : "bg-amber-100 text-amber-800")
                      }
                    >
                      {t.status === "active" ? taskStatusLabel(t.status) : formatRelativeTime(t.started_at)}
                    </span>
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

function DashboardMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "green" | "amber";
}) {
  const toneClass =
    tone === "blue"
      ? "border-t-blue-500"
      : tone === "green"
        ? "border-t-emerald-500"
        : "border-t-amber-500";

  return (
    <div className={`rounded-lg border border-t-4 bg-white p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function QuickLink({
  href,
  label,
  title,
  description,
}: {
  href: string;
  label: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group rounded-lg border bg-white p-4 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{label}</span>
        <span className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground">→</span>
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
    </Link>
  );
}
