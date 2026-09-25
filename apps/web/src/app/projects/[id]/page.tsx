import { and, desc, eq, gt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { db, projectMembers, projectMessages, taskOverlapResolutions, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { ActionLink } from "@/components/ui/action-link";
import { MetricCard } from "@/components/ui/metric-card";
import { EmptyPanel, Panel } from "@/components/ui/panel";
import { PageHeader } from "@/components/ui/page-header";
import { RiskBadge, StatusBadge } from "@/components/ui/status-badge";
import { TaskSummaryBox } from "@/components/ui/task-summary-box";
import { MonoPath, Workspace } from "@/components/ui/workspace";
import { getSessionUser } from "@/lib/auth";
import { gitRemoteLinks } from "@/lib/git-remote";
import {
  canManageProjectMembers,
  canWriteProject,
  getVisibleProject,
  isProjectMember,
  visibleTasksCondition,
  visibleUsersCondition,
} from "@/lib/project-access";
import { findActiveTaskOverlaps, taskOverlapKey, type ActiveTaskOverlap, type OverlapReason } from "@/lib/task-overlap";
import { clientLabel, cn, formatDateTime, formatRelativeTime, taskStatusLabel } from "@/lib/utils";
import { OverlapActionControls, type OverlapResolutionRow } from "./overlap-action-controls";
import { ProjectMessagesPanel, type ProjectMessageRow } from "./project-messages-panel";
import { ProjectMembersPanel, type ProjectMemberRow } from "./project-members-panel";
import { ProjectLiveUpdates } from "./project-live";

export const dynamic = "force-dynamic";

const UNKNOWN_BRANCH_FILTER = "__unknown__";

type SearchParams = {
  branch?: string;
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const query = await searchParams;
  const project = await getVisibleProject(id, user);
  if (!project) notFound();

  const activeCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const taskVisibility = visibleTasksCondition(user);
  const fullProjectView = await isProjectMember(project.id, user);
  const memberVisibility = fullProjectView ? undefined : visibleUsersCondition(user);

  const active = await db
    .select({
      id: tasks.id,
      client: tasks.client,
      intent: tasks.intent,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      started_at: tasks.startedAt,
      heartbeat_at: tasks.heartbeatAt,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        eq(tasks.projectId, project.id),
        eq(tasks.status, "active"),
        gt(tasks.heartbeatAt, activeCutoff),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .orderBy(desc(tasks.heartbeatAt));

  const recent = await db
    .select({
      id: tasks.id,
      client: tasks.client,
      intent: tasks.intent,
      branch: tasks.branch,
      files_touched: tasks.filesTouched,
      summary: tasks.summary,
      status: tasks.status,
      heartbeat_at: tasks.heartbeatAt,
      started_at: tasks.startedAt,
      ended_at: tasks.endedAt,
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(
      and(
        eq(tasks.projectId, project.id),
        gt(tasks.startedAt, recentCutoff),
        ...(taskVisibility ? [taskVisibility] : [])
      )
    )
    .orderBy(desc(tasks.startedAt))
    .limit(50);

  const members = await db
    .select({
      user_id: users.id,
      user_name: users.name,
      user_display_name: users.displayName,
      role: projectMembers.role,
      source: projectMembers.source,
      joined_at: projectMembers.createdAt,
      last_seen_at: projectMembers.lastSeenAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        ...(memberVisibility ? [memberVisibility] : [])
      )
    )
    .orderBy(desc(projectMembers.lastSeenAt));
  const canManageMembers = await canManageProjectMembers(project.id, user);
  const canWriteMessages = await canWriteProject(project.id, user);

  const messageAuthor = alias(users, "message_author");
  const messageTarget = alias(users, "message_target");
  const recentMessages = await db
    .select({
      id: projectMessages.id,
      thread_key: projectMessages.threadKey,
      body: projectMessages.body,
      task_id: projectMessages.taskId,
      created_at: projectMessages.createdAt,
      author_id: projectMessages.authorId,
      author_name: messageAuthor.name,
      author_display_name: messageAuthor.displayName,
      target_user_id: projectMessages.targetUserId,
      target_user_name: messageTarget.name,
      target_user_display_name: messageTarget.displayName,
    })
    .from(projectMessages)
    .leftJoin(messageAuthor, eq(projectMessages.authorId, messageAuthor.id))
    .leftJoin(messageTarget, eq(projectMessages.targetUserId, messageTarget.id))
    .where(
      and(
        eq(projectMessages.projectId, project.id),
        ...(fullProjectView
          ? []
          : [
              or(
                eq(projectMessages.authorId, user.id),
                eq(projectMessages.targetUserId, user.id)
              )!,
            ])
      )
    )
    .orderBy(desc(projectMessages.createdAt))
    .limit(20);

  const activeOverlaps = findActiveTaskOverlaps(active);
  const activeOverlapKeys = new Set(activeOverlaps.map((overlap) => overlap.key));
  const activeOverlapResolutions =
    active.length > 0
      ? (
          await db
            .select({
              first_task_id: taskOverlapResolutions.firstTaskId,
              second_task_id: taskOverlapResolutions.secondTaskId,
              action: taskOverlapResolutions.action,
              note: taskOverlapResolutions.note,
              resolved_by_name: users.name,
              resolved_by_display_name: users.displayName,
              updated_at: taskOverlapResolutions.updatedAt,
            })
            .from(taskOverlapResolutions)
            .leftJoin(users, eq(taskOverlapResolutions.resolvedBy, users.id))
            .where(eq(taskOverlapResolutions.projectId, project.id))
        )
          .map((resolution) => ({
            ...resolution,
            key: taskOverlapKey(resolution.first_task_id, resolution.second_task_id),
          }))
          .filter((resolution) => activeOverlapKeys.has(resolution.key))
      : [];
  const activeResolutionByKey = new Map(activeOverlapResolutions.map((resolution) => [resolution.key, resolution]));
  const canResolveOverlaps = canWriteMessages;
  const branchFilter = normalizeBranchFilter(query.branch);
  const filteredActive = filterActiveByBranch(active, branchFilter);
  const allActiveBranchGroups = groupActiveByBranch(active);
  const displayedActiveBranchGroups = groupActiveByBranch(filteredActive);
  const activeBranchOptions = getActiveBranchOptions(active, branchFilter);
  const isFiltered = branchFilter !== null;
  const remoteLinks = gitRemoteLinks(project.gitRemoteUrl);
  const fileHotspots = groupFileHotspots(active);
  const highRiskCount = activeOverlaps.filter((overlap) => overlap.severity === "high").length;
  const riskLevel = highRiskCount > 0 ? "high" : activeOverlaps.length > 0 ? "medium" : "none";
  const touchedFileCount = active.reduce((sum, task) => sum + task.files_touched.length, 0);
  const sortedActiveOverlaps = activeOverlaps
    .map((overlap) => ({
      overlap,
      resolution: activeResolutionByKey.get(overlap.key),
    }))
    .sort((a, b) => {
      const rankDelta = overlapSortRank(b.overlap, b.resolution) - overlapSortRank(a.overlap, a.resolution);
      if (rankDelta !== 0) return rankDelta;
      return a.overlap.key.localeCompare(b.overlap.key);
    });

  return (
    <AppShell user={user} activeNav="projects">
      <Workspace>
        <PageHeader
          eyebrow="项目协作现场"
          title={project.displayName ?? "未命名项目"}
          description={`远端哈希 ${project.gitRemoteHash.slice(0, 16)}... · 风险、分支和文件触达都在这里汇总。`}
          actions={
            <>
              <ActionLink href={`/projects/${project.id}/work`} variant="primary">工作流</ActionLink>
              <ActionLink href={`/projects/${project.id}/knowledge`}>知识库</ActionLink>
              {remoteLinks && <ExternalLinkButton href={remoteLinks.repository_url}>仓库</ExternalLinkButton>}
              {remoteLinks && <ExternalLinkButton href={remoteLinks.pulls_url}>PR</ExternalLinkButton>}
              <ActionLink href="/projects">返回项目</ActionLink>
            </>
          }
          meta={
            <div className="flex flex-wrap gap-2">
              <RiskBadge severity={riskLevel}>
                {riskLevel === "high" ? "高风险" : riskLevel === "medium" ? "待协调" : "正常"}
              </RiskBadge>
              <StatusBadge tone="online">{active.length} 个进行中</StatusBadge>
              <StatusBadge tone="agent">{allActiveBranchGroups.length} 个活跃分支</StatusBadge>
              <StatusBadge>{members.length} 位成员</StatusBadge>
              <StatusBadge>{touchedFileCount} 条文件触达</StatusBadge>
            </div>
          }
        />

        <section className="tp-reveal-list grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="当前进行中" value={active.length} detail={isFiltered ? `筛选后 ${filteredActive.length} 个` : "实时心跳任务"} tone="online" />
          <MetricCard label="冲突预警" value={activeOverlaps.length} detail={`${highRiskCount} 个高风险`} tone={activeOverlaps.length > 0 ? "risk" : "online"} />
          <MetricCard label="活跃分支" value={allActiveBranchGroups.length} detail={branchFilter ? branchFilterLabel(branchFilter) : "全部分支"} tone="agent" />
          <MetricCard label="7 天记录" value={recent.length} detail={`${members.length} 位项目成员`} tone="warning" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Panel
              title={`冲突与协调 (${activeOverlaps.length})`}
              description="同文件、同分支或跨分支同路径会进入风险队列。"
            >
              {activeOverlaps.length === 0 ? (
                <EmptyPanel>当前没有检测到冲突。继续保持任务心跳和文件触达上报。</EmptyPanel>
              ) : (
                <div className="tp-reveal-list space-y-3">
                  {sortedActiveOverlaps.map(({ overlap, resolution }) => (
                    <OverlapAlert
                      key={overlap.key}
                      projectId={project.id}
                      overlap={overlap}
                      resolution={resolution}
                      canResolve={canResolveOverlaps}
                    />
                  ))}
                </div>
              )}
            </Panel>

            <Panel
              title={`活跃任务矩阵 (${isFiltered ? `${filteredActive.length}/${active.length}` : active.length})`}
              description="按分支组织当前仍在运行的 Agent 工作。"
              actions={
                <BranchFilter
                  projectId={project.id}
                  currentBranch={branchFilter}
                  branchOptions={activeBranchOptions}
                />
              }
            >
              {active.length === 0 && <EmptyPanel>当前没有成员在这个项目上工作。</EmptyPanel>}
              {active.length > 0 && filteredActive.length === 0 && <EmptyPanel>当前筛选的分支没有进行中的任务。</EmptyPanel>}
              <div key={branchFilter ?? "all"} className="tp-reveal-list space-y-3">
                {displayedActiveBranchGroups.map((group) => (
                  <div key={group.key} className="overflow-hidden rounded-[22px] bg-white">
                    <div className="flex items-center justify-between gap-3 border-b border-black/5 bg-surface px-4 py-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-medium">{group.label}</h3>
                        {group.isUnknown && <div className="text-xs text-muted-foreground">未从客户端上报到 git branch</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!group.isUnknown && remoteLinks && (
                          <>
                            <ExternalTextLink href={remoteLinks.branch_url(group.key)}>分支</ExternalTextLink>
                            {isCompareableBranch(group.key) && <ExternalTextLink href={remoteLinks.compare_url(group.key)}>比较</ExternalTextLink>}
                          </>
                        )}
                        <StatusBadge>{group.tasks.length} 任务</StatusBadge>
                      </div>
                    </div>
                    <div className="tp-reveal-list divide-y divide-black/5">
                      {group.tasks.map((task) => (
                        <div key={task.id} className="grid gap-3 p-4 text-sm lg:grid-cols-[minmax(0,1fr)_160px_160px] lg:items-start">
                          <div className="min-w-0">
                            <div className="line-clamp-2 font-medium">{task.intent}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {task.user_display_name ?? task.user_name} · 心跳 {formatRelativeTime(task.heartbeat_at)}
                            </div>
                            {task.files_touched.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {task.files_touched.slice(0, 5).map((file) => (
                                  <MonoPath key={file} className="rounded-full bg-surface px-2.5 py-1">
                                    {file}
                                  </MonoPath>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge tone="online" dot>进行中</StatusBadge>
                            <StatusBadge tone="agent">{clientLabel(task.client)}</StatusBadge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            开始 {formatRelativeTime(task.started_at)}
                            <br />
                            {task.files_touched.length} 条路径
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <aside className="space-y-6">
            <Panel title="文件风险热区" description="活跃任务触达最多的路径。">
              {fileHotspots.length === 0 ? (
                <EmptyPanel>暂无文件触达数据。</EmptyPanel>
              ) : (
                <div className="tp-reveal-list space-y-2">
                  {fileHotspots.slice(0, 8).map((hotspot) => (
                    <div key={hotspot.path} className="rounded-[20px] bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <MonoPath className="flex-1 text-foreground">{hotspot.path}</MonoPath>
                        <StatusBadge tone={hotspot.count > 1 ? "warning" : "slate"}>{hotspot.count} 次</StatusBadge>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-agent" style={{ width: `${Math.min(hotspot.count * 18, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <ProjectLiveUpdates projectId={project.id} />
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <ProjectMembersPanel
            projectId={project.id}
            members={members as ProjectMemberRow[]}
            canManage={canManageMembers}
            currentUserId={user.id}
          />

          <ProjectMessagesPanel
            projectId={project.id}
            messages={recentMessages.reverse() as ProjectMessageRow[]}
            members={members as ProjectMemberRow[]}
            canSend={canWriteMessages}
          />
        </section>

        <Panel title="最近动态 · 7 天" description="作为项目审计线索保留。">
          {recent.length === 0 ? (
            <EmptyPanel>最近 7 天没有历史记录。</EmptyPanel>
          ) : (
            <ul className="tp-reveal-list divide-y divide-black/5 overflow-hidden rounded-[22px] bg-white">
              {recent.map((task) => (
                <li key={task.id} className="grid gap-3 px-4 py-3 text-sm transition hover:bg-surface md:grid-cols-[96px_minmax(0,1fr)_150px] md:items-start">
                  <div className="text-xs text-muted-foreground">{formatRelativeTime(task.started_at)}</div>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{task.user_display_name ?? task.user_name}</span>
                      <StatusBadge tone="agent">{clientLabel(task.client)}</StatusBadge>
                      {task.branch ? (
                        <span className="max-w-52 truncate font-mono text-xs text-muted-foreground">分支 {task.branch}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">未检测到分支</span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-muted-foreground">
                      {task.intent}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {task.ended_at ? <span>结束 {formatDateTime(task.ended_at)}</span> : <span>心跳 {formatRelativeTime(task.heartbeat_at)}</span>}
                      <span>{task.files_touched.length} 条路径</span>
                    </div>
                    {task.files_touched.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {task.files_touched.slice(0, 4).map((file) => (
                          <MonoPath key={file} className="rounded-full bg-surface px-2.5 py-1">
                            {file}
                          </MonoPath>
                        ))}
                        {task.files_touched.length > 4 && (
                          <span className="rounded-full bg-surface px-2.5 py-1 text-xs text-muted-foreground">
                            +{task.files_touched.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    {task.summary && <TaskSummaryBox summary={task.summary} className="mt-1" />}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 md:justify-end">
                    <StatusBadge tone={task.status === "active" ? "online" : task.status === "done" ? "slate" : "warning"}>
                      {taskStatusLabel(task.status)}
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Workspace>
    </AppShell>
  );
}

function ExternalLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-surface"
    >
      {children}
    </a>
  );
}

function ExternalTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
    >
      {children}
    </a>
  );
}

function BranchFilter({
  projectId,
  currentBranch,
  branchOptions,
}: {
  projectId: string;
  currentBranch: string | null;
  branchOptions: string[];
}) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 text-xs">
      <Link href={`/projects/${projectId}`} className={branchChipClass(currentBranch === null)}>
        全部
      </Link>
      <Link
        href={`/projects/${projectId}?branch=${encodeURIComponent(UNKNOWN_BRANCH_FILTER)}`}
        className={branchChipClass(currentBranch === UNKNOWN_BRANCH_FILTER)}
      >
        未检测
      </Link>
      {branchOptions.map((branch) => (
        <Link
          key={branch}
          href={`/projects/${projectId}?branch=${encodeURIComponent(branch)}`}
          className={branchChipClass(currentBranch === branch)}
          title={branch}
        >
          <span className="block max-w-40 truncate">{branch}</span>
        </Link>
      ))}
      {currentBranch && (
        <Link href={`/projects/${projectId}`} className="shrink-0 px-2 py-1 text-muted-foreground hover:text-foreground">
          清空
        </Link>
      )}
    </div>
  );
}

function branchChipClass(active: boolean): string {
  return cn(
    "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 font-medium transition",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-white text-muted-foreground hover:border-slate-300 hover:text-foreground"
  );
}

function OverlapAlert({
  projectId,
  overlap,
  resolution,
  canResolve,
}: {
  projectId: string;
  overlap: ActiveTaskOverlap;
  resolution?: OverlapResolutionRow;
  canResolve: boolean;
}) {
  const firstName = overlap.first.user_display_name ?? overlap.first.user_name;
  const secondName = overlap.second.user_display_name ?? overlap.second.user_name;
  const isMergeRisk = overlap.reasons.includes("merge_risk");
  const badgeLabel = overlapBadgeLabel(overlap, resolution, isMergeRisk);
  const badgeTone = overlapBadgeTone(overlap, resolution);
  const isRisk = badgeTone === "risk";
  const borderClass = isRisk
    ? "border-red-200 bg-red-50 text-red-950"
    : "border-amber-200 bg-amber-50 text-amber-950";
  const mutedClass = isRisk ? "text-red-800" : "text-amber-800";
  const innerBorderClass = isRisk ? "border-red-200" : "border-amber-200";

  return (
    <div className={cn("rounded-[22px] border p-4 text-sm", borderClass)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-medium">
            {firstName} 和 {secondName}
            {isMergeRisk ? " 在不同分支修改了相同路径" : " 可能在处理同一块内容"}
          </div>
          <div className={cn("mt-1 text-xs", mutedClass)}>
            {overlapContextLabel(overlap)}
          </div>
        </div>
        <StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <TaskSummary name={firstName} intent={overlap.first.intent} />
        <TaskSummary name={secondName} intent={overlap.second.intent} />
      </div>
      {overlap.overlapping_files.length > 0 && (
        <div className={cn("mt-3 flex flex-wrap gap-1 rounded-[18px] border bg-white/70 p-2", innerBorderClass)}>
          {overlap.overlapping_files.slice(0, 6).map((file) => (
            <MonoPath key={file} className={cn("rounded bg-white px-2 py-1", isRisk ? "text-red-900" : "text-amber-900")}>
              {file}
            </MonoPath>
          ))}
          {overlap.overlapping_files.length > 6 && (
            <span className={cn("text-xs", mutedClass)}>另有 {overlap.overlapping_files.length - 6} 个路径</span>
          )}
        </div>
      )}
      <OverlapActionControls
        projectId={projectId}
        firstTaskId={overlap.first.task_id}
        secondTaskId={overlap.second.task_id}
        resolution={resolution}
        canResolve={canResolve}
      />
    </div>
  );
}

function TaskSummary({ name, intent }: { name: string; intent: string }) {
  return (
    <div className="min-w-0 rounded border border-amber-200 bg-white/70 p-2">
      <div className="text-xs font-medium text-amber-900">{name}</div>
      <div className="mt-1 truncate text-xs text-amber-800">{intent}</div>
    </div>
  );
}

function overlapSortRank(
  overlap: ActiveTaskOverlap,
  resolution: OverlapResolutionRow | undefined
): number {
  if (resolution) return 0;
  if (overlap.severity === "high") return 4;
  if (overlap.reasons.includes("merge_risk")) return 3;
  if (overlap.severity === "medium") return 2;
  return 1;
}

function overlapReasonLabel(reasons: OverlapReason[]): string {
  const labels = [];
  if (reasons.includes("files")) labels.push("文件路径重叠");
  if (reasons.includes("branch")) labels.push("同一分支并行");
  if (reasons.includes("merge_risk")) labels.push("跨分支改同一路径");
  return labels.join("、");
}

function overlapResolutionLabel(action: string): string {
  if (action === "acknowledged") return "已沟通";
  if (action === "handoff") return "已接手";
  if (action === "paused") return "暂停等待";
  return action;
}

function overlapBadgeLabel(
  overlap: ActiveTaskOverlap,
  resolution: OverlapResolutionRow | undefined,
  isMergeRisk: boolean
): string {
  if (resolution) return overlapResolutionLabel(resolution.action);
  if (overlap.severity === "high") return "高风险";
  if (isMergeRisk) return "合并风险";
  return "需确认";
}

function overlapBadgeTone(
  overlap: ActiveTaskOverlap,
  resolution: OverlapResolutionRow | undefined
): "online" | "warning" | "risk" {
  if (resolution?.action === "paused") return "warning";
  if (resolution) return "online";
  if (overlap.severity === "high") return "risk";
  return "warning";
}

function overlapContextLabel(overlap: ActiveTaskOverlap): string {
  const labels = [overlapReasonLabel(overlap.reasons)];
  if (overlap.reasons.includes("merge_risk")) {
    labels.push(`分支：${branchLabel(overlap.first.branch)} / ${branchLabel(overlap.second.branch)}`);
  } else if (overlap.reasons.includes("branch")) {
    labels.push(`分支：${branchLabel(overlap.first.branch)}`);
  }
  return labels.join(" · ");
}

function branchLabel(branch: string | null): string {
  return branch?.trim() || "未检测到分支";
}

function isCompareableBranch(branch: string): boolean {
  return branch !== "main" && branch !== "master";
}

function branchFilterLabel(branchFilter: string | null): string {
  if (branchFilter === UNKNOWN_BRANCH_FILTER) return "未检测到分支";
  return branchFilter ? `分支：${branchFilter}` : "全部分支";
}

function normalizeBranchFilter(branch: string | undefined): string | null {
  const trimmed = branch?.trim();
  if (!trimmed) return null;
  return trimmed;
}

function filterActiveByBranch<T extends { branch: string | null }>(tasks: T[], branchFilter: string | null) {
  if (!branchFilter) return tasks;
  if (branchFilter === UNKNOWN_BRANCH_FILTER) {
    return tasks.filter((task) => !task.branch?.trim());
  }
  return tasks.filter((task) => task.branch?.trim() === branchFilter);
}

function getActiveBranchOptions<T extends { branch: string | null }>(tasks: T[], branchFilter: string | null) {
  const branches = new Set<string>();
  for (const task of tasks) {
    const branch = task.branch?.trim();
    if (branch) branches.add(branch);
  }
  if (branchFilter && branchFilter !== UNKNOWN_BRANCH_FILTER) branches.add(branchFilter);
  return Array.from(branches).sort((a, b) => a.localeCompare(b));
}

function groupActiveByBranch<T extends { branch: string | null }>(tasks: T[]) {
  const groups = new Map<string, { key: string; label: string; isUnknown: boolean; tasks: T[] }>();

  for (const task of tasks) {
    const branch = task.branch?.trim();
    const key = branch || "__unknown__";
    const existing = groups.get(key);
    if (existing) {
      existing.tasks.push(task);
      continue;
    }
    groups.set(key, {
      key,
      label: branch ? `分支：${branch}` : "未检测到分支",
      isUnknown: !branch,
      tasks: [task],
    });
  }

  return Array.from(groups.values());
}

function groupFileHotspots<T extends { files_touched: string[] }>(tasks: T[]) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const file of task.files_touched) {
      const path = file.trim();
      if (!path) continue;
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
}
