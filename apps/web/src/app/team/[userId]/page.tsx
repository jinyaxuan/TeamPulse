import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AgentMetadataForm } from "@/components/agent-metadata-form";
import { AppShell } from "@/components/app-shell";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TaskSummaryBox } from "@/components/ui/task-summary-box";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { getSessionUser } from "@/lib/auth";
import { agentDisplayName, agentTypeLabel } from "@/lib/agent-display";
import { getTeamMemberDetail, type TeamMemberTask } from "@/lib/team-members";
import { shouldShowTestData, SHOW_TEST_DATA_PARAM } from "@/lib/test-data";
import {
  clientLabel,
  deviceStatusLabel,
  formatDateTime,
  formatRelativeTime,
  roleLabel,
  taskStatusLabel,
} from "@/lib/utils";
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
  const activeFiles = detail.activeTasks.reduce((sum, task) => sum + task.files_touched.length, 0);
  const lastActive = detail.activeTasks[0]?.heartbeat_at ?? detail.recentTasks[0]?.started_at ?? detail.member.created_at;

  return (
    <AppShell user={sessionUser} activeNav="team">
      <Workspace>
        <PageHeader
          eyebrow="成员工作台"
          title={memberName}
          description={`@${detail.member.name}${detail.member.email ? ` · ${detail.member.email}` : ""} · 加入 ${formatRelativeTime(detail.member.created_at)}`}
          actions={
            <>
              <ActionLink href="/team">返回团队</ActionLink>
              {canAdmin && <ActionLink href="/admin/users">用户管理</ActionLink>}
            </>
          }
          meta={
            <div className="flex flex-wrap gap-2">
              {isSelf && <StatusBadge tone="dark">我</StatusBadge>}
              <StatusBadge tone={detail.member.role === "admin" ? "info" : "slate"}>{roleLabel(detail.member.role)}</StatusBadge>
              <StatusBadge tone={detail.member.active_task_count > 0 ? "online" : "slate"} dot={detail.member.active_task_count > 0}>
                {detail.member.active_task_count > 0 ? "忙碌" : "空闲"}
              </StatusBadge>
              <StatusBadge tone="agent">{detail.member.active_device_count} 个活跃 Agent</StatusBadge>
              <StatusBadge>最近 {formatRelativeTime(lastActive)}</StatusBadge>
            </div>
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="实时任务" value={detail.member.active_task_count} detail="15 分钟内有心跳" tone="online" />
          <MetricCard label="7 天任务" value={detail.member.task_count} detail={`${detail.member.done_count} 个已完成`} tone="agent" />
          <MetricCard label="Agent" value={detail.member.active_device_count} detail={`共 ${detail.member.total_device_count} 个设备记录`} tone="agent" />
          <MetricCard label="活跃文件" value={activeFiles} detail="当前任务触达路径数" tone={activeFiles > 0 ? "warning" : "default"} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Panel title={`当前任务 (${detail.activeTasks.length})`} description="这个成员当前正在执行的 Agent 工作。">
              <TaskList tasks={detail.activeTasks} empty="这个成员当前没有实时任务。" />
            </Panel>

            <Panel title={`参与项目 (${detail.projects.length})`} description="按最近确认排序，展示成员所在协作边界。">
              {detail.projects.length === 0 ? (
                <EmptyPanel>还没有参与项目。</EmptyPanel>
              ) : (
                <div className="space-y-2">
                  {detail.projects.map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{project.display_name ?? "未命名项目"}</div>
                          <MonoPath className="mt-1 block truncate">{project.git_remote_url ?? project.id}</MonoPath>
                        </div>
                        <div className="flex flex-shrink-0 flex-wrap gap-2">
                          <StatusBadge>{project.role}</StatusBadge>
                          {project.active_task_count > 0 && <StatusBadge tone="online">{project.active_task_count} 实时任务</StatusBadge>}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {projectSourceLabel(project.source)} · 最近确认 {formatRelativeTime(project.last_seen_at)}
                        {project.last_task_at && ` · 最近任务 ${formatRelativeTime(project.last_task_at)}`}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title={`最近任务 (${detail.recentTasks.length})`} description="最近 7 天的任务记录。">
              <TaskList tasks={detail.recentTasks} empty="最近 7 天没有任务。" />
            </Panel>
          </div>

          <aside className="space-y-6">
            <Panel title={`Agent 档案 (${detail.devices.length})`} description="设备是 Agent 的信任链和身份档案。">
              {detail.devices.length === 0 ? (
                <EmptyPanel>还没有绑定 Agent。</EmptyPanel>
              ) : (
                <div className="space-y-3">
                  {detail.devices.map((device) => (
                    <div key={device.id} className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_-30px_rgba(0,0,0,0.34)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{agentDisplayName(device)}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {agentTypeLabel(device.agent_type)} · {device.hostname ?? "未知主机"}
                            {device.os && ` · ${device.os}`}
                            {device.git_email && ` · ${device.git_email}`}
                          </div>
                        </div>
                        <StatusBadge tone={device.status === "active" ? "online" : "slate"} dot={device.status === "active"}>
                          {deviceStatusLabel(device.status)}
                        </StatusBadge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>注册 {formatRelativeTime(device.registered_at)}</div>
                        <div>最近使用 {device.last_used_at ? formatRelativeTime(device.last_used_at) : "暂无"}</div>
                      </div>
                      {device.agent_role && (
                        <div className="mt-3 rounded-[16px] bg-surface px-3 py-2 text-xs leading-5 text-muted-foreground">
                          {device.agent_role}
                        </div>
                      )}
                      {device.capabilities.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {device.capabilities.map((capability) => (
                            <StatusBadge key={capability} tone="agent">
                              {capability}
                            </StatusBadge>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 border-t border-black/5 pt-3">
                        {canAdmin && device.status === "active" && (
                          <div className="mb-3">
                            <RevokeDeviceButton deviceId={device.id} />
                          </div>
                        )}
                        {(canAdmin || isSelf) && <AgentMetadataForm device={device} compact />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {canAdmin && (
              <Panel title="成员权限" description="管理员可以调整角色或撤销成员。">
                <MemberRoleActions
                  memberId={detail.member.id}
                  memberName={memberName}
                  role={detail.member.role}
                  isSelf={isSelf}
                />
              </Panel>
            )}

            <Panel title={`相关消息 (${detail.recentMessages.length})`} description="与这个成员有关的 Agent 协调记录。">
              {detail.recentMessages.length === 0 ? (
                <EmptyPanel>暂无相关 Agent 消息。</EmptyPanel>
              ) : (
                <div className="space-y-2">
                  {detail.recentMessages.map((message) => (
                    <Link
                      key={message.id}
                      href={`/projects/${message.project_id}`}
                      className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {message.author_display_name ?? message.author_name ?? "未知成员"}
                        </span>
                        <MonoPath>{message.thread_key}</MonoPath>
                      </div>
                      <div className="mt-2 line-clamp-3 text-sm leading-6">{message.body}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {message.project_name ?? "项目"} · {formatRelativeTime(message.created_at)}
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

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function TaskList({ tasks, empty }: { tasks: TeamMemberTask[]; empty: string }) {
  if (tasks.length === 0) return <EmptyPanel>{empty}</EmptyPanel>;

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <Link
          key={task.id}
          href={`/projects/${task.project_id}`}
          className="block rounded-[22px] bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-surface hover:shadow-[0_18px_42px_-34px_rgba(0,0,0,0.32)]"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium">{task.intent}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {task.project_name ?? "项目"} · {clientLabel(task.client)}
                {task.branch && ` · ${task.branch}`}
              </div>
            </div>
            <StatusBadge tone={task.status === "active" ? "online" : task.status === "done" ? "slate" : "warning"}>
              {taskStatusLabel(task.status)}
            </StatusBadge>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            开始 {formatRelativeTime(task.started_at)}
            {task.ended_at && ` · 结束 ${formatDateTime(task.ended_at)}`}
            {task.files_touched.length > 0 && ` · 触碰 ${task.files_touched.length} 个文件`}
          </div>
          {task.files_touched.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {task.files_touched.slice(0, 4).map((file) => (
                <MonoPath key={file} className="rounded-full bg-surface px-2.5 py-1">
                  {file}
                </MonoPath>
              ))}
            </div>
          )}
          {task.summary && <TaskSummaryBox summary={task.summary} />}
        </Link>
      ))}
    </div>
  );
}

function projectSourceLabel(source: string): string {
  if (source === "activity") return "任务加入";
  if (source === "resolve") return "仓库加入";
  if (source === "manual") return "手动加入";
  return "成员";
}
