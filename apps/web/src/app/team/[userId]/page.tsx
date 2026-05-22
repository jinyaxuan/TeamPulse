import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AgentMetadataForm } from "@/components/agent-metadata-form";
import { getSessionUser } from "@/lib/auth";
import { agentDisplayName, agentTypeLabel } from "@/lib/agent-display";
import { shouldShowTestData, SHOW_TEST_DATA_PARAM } from "@/lib/test-data";
import {
  clientLabel,
  deviceStatusLabel,
  formatDateTime,
  formatRelativeTime,
  roleLabel,
  taskStatusLabel,
} from "@/lib/utils";
import { getTeamMemberDetail, type TeamMemberTask } from "@/lib/team-members";
import { MemberRoleActions, RevokeDeviceButton } from "./member-actions";

export const dynamic = "force-dynamic";

export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/login");

  const { userId } = await params;
  const query = await searchParams;
  const includeTestData = shouldShowTestData(firstSearchParam(query[SHOW_TEST_DATA_PARAM]));
  const detail = await getTeamMemberDetail(sessionUser, userId, { includeTestData });
  if (!detail) notFound();

  const memberName = detail.member.display_name ?? detail.member.name;
  const isSelf = detail.member.id === sessionUser.id;
  const canAdmin = sessionUser.role === "admin";

  return (
    <AppShell user={sessionUser} activeNav="team">
      <div className="space-y-6">
        <header className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">成员详情</div>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-semibold text-white">
                  {memberName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-2xl font-semibold">{memberName}</h1>
                    {isSelf && <Pill tone="dark">我</Pill>}
                    <Pill tone={detail.member.role === "admin" ? "blue" : "slate"}>
                      {roleLabel(detail.member.role)}
                    </Pill>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>@{detail.member.name}</span>
                    {detail.member.email && <span>{detail.member.email}</span>}
                    <span>加入 {formatRelativeTime(detail.member.created_at)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/team"
                className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
              >
                返回团队
              </Link>
              {canAdmin && (
                <Link
                  href="/admin/users"
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  用户管理
                </Link>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="实时任务" value={detail.member.active_task_count} detail="15 分钟内有心跳" />
          <MetricCard label="7 天任务" value={detail.member.task_count} detail={`${detail.member.done_count} 个已完成`} />
          <MetricCard label="Agent" value={detail.member.active_device_count} detail={`共 ${detail.member.total_device_count} 个记录`} />
          <MetricCard label="参与项目" value={detail.projects.length} detail="按最近确认排序" />
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Panel title={`进行中任务 (${detail.activeTasks.length})`}>
              <TaskList tasks={detail.activeTasks} empty="这个成员当前没有实时任务。" />
            </Panel>

            <Panel title={`参与项目 (${detail.projects.length})`}>
              <div className="space-y-2">
                {detail.projects.length === 0 && <EmptyState>还没有参与项目。</EmptyState>}
                {detail.projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-md border bg-white p-3 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{project.display_name ?? "未命名项目"}</div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {project.git_remote_url ?? project.id}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-wrap gap-2">
                        <Pill tone="slate">{project.role}</Pill>
                        {project.active_task_count > 0 && <Pill tone="green">{project.active_task_count} 个实时任务</Pill>}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {projectSourceLabel(project.source)} · 最近确认 {formatRelativeTime(project.last_seen_at)}
                      {project.last_task_at && ` · 最近任务 ${formatRelativeTime(project.last_task_at)}`}
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title={`最近任务 (${detail.recentTasks.length})`}>
              <TaskList tasks={detail.recentTasks} empty="最近 7 天没有任务。" />
            </Panel>
          </div>

          <aside className="space-y-6">
            {canAdmin && (
              <MemberRoleActions
                memberId={detail.member.id}
                memberName={memberName}
                role={detail.member.role}
                isSelf={isSelf}
              />
            )}

            <Panel title={`Agent (${detail.devices.length})`}>
              <div className="space-y-2">
                {detail.devices.length === 0 && <EmptyState>还没有绑定 Agent。</EmptyState>}
                {detail.devices.map((device) => (
                  <div key={device.id} className="rounded-md border bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {agentDisplayName(device)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {agentTypeLabel(device.agent_type)} · {device.hostname ?? "未知主机"}
                          {device.os && ` · ${device.os}`}
                          {device.git_email && ` · ${device.git_email}`}
                        </div>
                      </div>
                      <Pill tone={device.status === "active" ? "green" : "slate"}>
                        {deviceStatusLabel(device.status)}
                      </Pill>
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3 text-xs text-muted-foreground">
                      <div>
                        <div>注册 {formatRelativeTime(device.registered_at)}</div>
                        <div>
                          最近使用 {device.last_used_at ? formatRelativeTime(device.last_used_at) : "暂无"}
                        </div>
                      </div>
                      {canAdmin && device.status === "active" && (
                        <RevokeDeviceButton deviceId={device.id} />
                      )}
                    </div>
                    {device.agent_role && (
                      <div className="mt-3 rounded-md bg-slate-50 px-2 py-1 text-xs leading-5 text-muted-foreground">
                        {device.agent_role}
                      </div>
                    )}
                    {device.capabilities.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {device.capabilities.map((capability) => (
                          <Pill key={capability} tone="slate">
                            {capability}
                          </Pill>
                        ))}
                      </div>
                    )}
                    {(canAdmin || isSelf) && (
                      <div className="mt-3 border-t pt-3">
                        <AgentMetadataForm device={device} compact />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={`相关消息 (${detail.recentMessages.length})`}>
              <div className="space-y-2">
                {detail.recentMessages.length === 0 && <EmptyState>暂无相关 Agent 消息。</EmptyState>}
                {detail.recentMessages.map((message) => (
                  <Link
                    key={message.id}
                    href={`/projects/${message.project_id}`}
                    className="block rounded-md border bg-white p-3 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {message.author_display_name ?? message.author_name ?? "未知成员"}
                      </span>
                      <span className="font-mono">{message.thread_key}</span>
                    </div>
                    <div className="mt-2 line-clamp-3 text-sm leading-6">{message.body}</div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {message.project_name ?? "项目"} · {formatRelativeTime(message.created_at)}
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          </aside>
        </section>
      </div>
    </AppShell>
  );
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function TaskList({ tasks, empty }: { tasks: TeamMemberTask[]; empty: string }) {
  if (tasks.length === 0) return <EmptyState>{empty}</EmptyState>;

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <Link
          key={task.id}
          href={`/projects/${task.project_id}`}
          className="block rounded-md border bg-white p-3 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium">{task.intent}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {task.project_name ?? "项目"} · {clientLabel(task.client)}
                {task.branch && ` · ${task.branch}`}
              </div>
            </div>
            <Pill tone={task.status === "active" ? "green" : task.status === "done" ? "slate" : "amber"}>
              {taskStatusLabel(task.status)}
            </Pill>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            开始 {formatRelativeTime(task.started_at)}
            {task.ended_at && ` · 结束 ${formatDateTime(task.ended_at)}`}
            {task.files_touched.length > 0 && ` · 触碰 ${task.files_touched.length} 个文件`}
          </div>
          {task.summary && (
            <div className="mt-2 line-clamp-2 rounded-md bg-slate-50 px-2 py-1 text-xs leading-5 text-muted-foreground">
              {task.summary}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-t-4 border-t-slate-400 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed bg-white p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: "dark" | "blue" | "green" | "amber" | "slate" }) {
  const classes =
    tone === "dark"
      ? "bg-slate-900 text-white"
      : tone === "blue"
        ? "bg-blue-100 text-blue-800"
        : tone === "green"
          ? "bg-green-100 text-green-800"
          : tone === "amber"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-700";

  return (
    <span className={`w-fit flex-shrink-0 rounded-full px-2 py-0.5 text-xs ${classes}`}>
      {children}
    </span>
  );
}

function projectSourceLabel(source: string): string {
  if (source === "activity") return "任务加入";
  if (source === "resolve") return "仓库加入";
  if (source === "manual") return "手动加入";
  return "成员";
}
