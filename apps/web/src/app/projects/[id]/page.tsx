import { and, desc, eq, gt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { db, projectMembers, projectMessages, taskOverlapResolutions, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { gitRemoteLinks } from "@/lib/git-remote";
import { canManageProjectMembers, canWriteProject, getVisibleProject } from "@/lib/project-access";
import { findActiveTaskOverlaps, taskOverlapKey, type ActiveTaskOverlap, type OverlapReason } from "@/lib/task-overlap";
import { formatRelativeTime, taskStatusLabel } from "@/lib/utils";
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

  const active = await db
    .select({
      id: tasks.id,
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
        gt(tasks.heartbeatAt, activeCutoff)
      )
    )
    .orderBy(desc(tasks.heartbeatAt));

  const recent = await db
    .select({
      id: tasks.id,
      intent: tasks.intent,
      branch: tasks.branch,
      summary: tasks.summary,
      status: tasks.status,
      started_at: tasks.startedAt,
      ended_at: tasks.endedAt,
      user_name: users.name,
      user_display_name: users.displayName,
    })
    .from(tasks)
    .innerJoin(users, eq(tasks.userId, users.id))
    .where(and(eq(tasks.projectId, project.id), gt(tasks.startedAt, recentCutoff)))
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
    .where(eq(projectMembers.projectId, project.id))
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
    .where(eq(projectMessages.projectId, project.id))
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
  const mergeRiskOverlaps = activeOverlaps.filter((overlap) => overlap.reasons.includes("merge_risk"));
  const coordinationOverlaps = activeOverlaps.filter((overlap) => !overlap.reasons.includes("merge_risk"));
  const branchFilter = normalizeBranchFilter(query.branch);
  const filteredActive = filterActiveByBranch(active, branchFilter);
  const allActiveBranchGroups = groupActiveByBranch(active);
  const displayedActiveBranchGroups = groupActiveByBranch(filteredActive);
  const activeBranchOptions = getActiveBranchOptions(active, branchFilter);
  const isFiltered = branchFilter !== null;
  const remoteLinks = gitRemoteLinks(project.gitRemoteUrl);

  return (
    <AppShell user={user} activeNav="projects">
      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">项目详情</div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{project.displayName ?? "未命名项目"}</h1>
              <div className="mt-1 font-mono text-xs text-muted-foreground">
                远端哈希：{project.gitRemoteHash.slice(0, 16)}…
              </div>
              {remoteLinks && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <ExternalLinkButton href={remoteLinks.repository_url}>仓库</ExternalLinkButton>
                  <ExternalLinkButton href={remoteLinks.pulls_url}>PR</ExternalLinkButton>
                </div>
              )}
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-md border bg-background px-3 py-2">
                当前进行中 <strong className="ml-1 text-foreground">{active.length}</strong>
              </span>
              <span className="rounded-md border bg-background px-3 py-2">
                活跃分支 <strong className="ml-1 text-foreground">{allActiveBranchGroups.length}</strong>
              </span>
              <span className="rounded-md border bg-background px-3 py-2">
                7 天记录 <strong className="ml-1 text-foreground">{recent.length}</strong>
              </span>
              <span className="rounded-md border bg-background px-3 py-2">
                项目成员 <strong className="ml-1 text-foreground">{members.length}</strong>
              </span>
            </div>
          </div>
        </div>

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

        <section>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                当前进行中 ({isFiltered ? `${filteredActive.length}/${active.length}` : active.length})
              </h2>
              {isFiltered && (
                <div className="mt-1 text-xs text-muted-foreground">
                  当前筛选：{branchFilterLabel(branchFilter)}
                </div>
              )}
            </div>
            <BranchFilter
              projectId={project.id}
              currentBranch={branchFilter}
              branchOptions={activeBranchOptions}
            />
          </div>
          <div className="mt-3 space-y-3">
            {active.length === 0 && (
              <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                当前没有成员在这个项目上工作。
              </div>
            )}
            {active.length > 0 && filteredActive.length === 0 && (
              <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                当前筛选的分支没有进行中的任务。
              </div>
            )}
            {displayedActiveBranchGroups.map((group) => (
              <div key={group.key} className="overflow-hidden rounded-md border bg-card">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">{group.label}</h3>
                    {group.isUnknown && (
                      <div className="text-xs text-muted-foreground">未从客户端上报到 git branch</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!group.isUnknown && remoteLinks && (
                      <>
                        <ExternalTextLink href={remoteLinks.branch_url(group.key)}>分支</ExternalTextLink>
                        {isCompareableBranch(group.key) && (
                          <ExternalTextLink href={remoteLinks.compare_url(group.key)}>比较</ExternalTextLink>
                        )}
                      </>
                    )}
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                      {group.tasks.length} 个任务
                    </span>
                  </div>
                </div>
                <div className="divide-y">
                  {group.tasks.map((t) => (
                    <div key={t.id} className="p-3">
                      <div className="text-sm font-medium">{t.intent}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t.user_display_name ?? t.user_name}
                        {" · "}
                        {formatRelativeTime(t.started_at)}
                      </div>
                      {t.files_touched.length > 0 && (
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {t.files_touched.slice(0, 5).join(", ")}
                          {t.files_touched.length > 5 && `（另有 ${t.files_touched.length - 5} 个文件）`}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {coordinationOverlaps.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              高风险与同分支重叠 ({coordinationOverlaps.length})
            </h2>
            <div className="mt-3 space-y-2">
              {coordinationOverlaps.map((overlap) => (
                <OverlapAlert
                  key={overlap.key}
                  projectId={project.id}
                  overlap={overlap}
                  resolution={activeResolutionByKey.get(overlap.key)}
                  canResolve={canResolveOverlaps}
                />
              ))}
            </div>
          </section>
        )}

        {mergeRiskOverlaps.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              合并风险队列 ({mergeRiskOverlaps.length})
            </h2>
            <div className="mt-3 space-y-2">
              {mergeRiskOverlaps.map((overlap) => (
                <OverlapAlert
                  key={overlap.key}
                  projectId={project.id}
                  overlap={overlap}
                  resolution={activeResolutionByKey.get(overlap.key)}
                  canResolve={canResolveOverlaps}
                />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            最近动态 · 7 天
          </h2>
          <div className="mt-3 overflow-hidden rounded-md border bg-card">
            {recent.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">最近 7 天没有历史记录。</div>
            )}
            <ul className="divide-y">
              {recent.map((t) => (
                <li key={t.id} className="grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-3 text-sm">
                  <div className="w-24 flex-shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(t.started_at)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate">
                      <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                      <span className="text-muted-foreground"> — {t.intent}</span>
                    </div>
                    {t.summary && (
                      <div className="mt-1 line-clamp-3 rounded border bg-muted/40 p-2 text-xs leading-5 text-muted-foreground">
                        {t.summary}
                      </div>
                    )}
                  </div>
                  <div
                    className={
                      "h-fit flex-shrink-0 self-start rounded-full px-2 py-0.5 text-xs " +
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

        <ProjectLiveUpdates projectId={project.id} />
      </div>
    </AppShell>
  );
}

function ExternalLinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border bg-background px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
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
    <form action={`/projects/${projectId}`} method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <label className="text-xs font-medium text-muted-foreground" htmlFor="project-branch-filter">
        分支
      </label>
      <select
        id="project-branch-filter"
        name="branch"
        defaultValue={currentBranch ?? ""}
        className="rounded-md border border-input bg-background px-3 py-2"
      >
        <option value="">全部分支</option>
        <option value={UNKNOWN_BRANCH_FILTER}>未检测到分支</option>
        {branchOptions.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700"
      >
        应用
      </button>
      {currentBranch && (
        <Link
          href={`/projects/${projectId}`}
          className="px-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          清空
        </Link>
      )}
    </form>
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
  const badgeClass = overlapBadgeClass(overlap, resolution);

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-medium">
            {firstName} 和 {secondName}
            {isMergeRisk ? " 在不同分支修改了相同路径" : " 可能在处理同一块内容"}
          </div>
          <div className="mt-1 text-xs text-amber-800">
            {overlapContextLabel(overlap)}
          </div>
        </div>
        <span
          className={
            "w-fit rounded-full px-2 py-0.5 text-xs font-medium " + badgeClass
          }
        >
          {badgeLabel}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <TaskSummary name={firstName} intent={overlap.first.intent} />
        <TaskSummary name={secondName} intent={overlap.second.intent} />
      </div>
      {overlap.overlapping_files.length > 0 && (
        <div className="mt-3 rounded border border-amber-200 bg-white/70 p-2 font-mono text-xs text-amber-900">
          {overlap.overlapping_files.slice(0, 6).join(", ")}
          {overlap.overlapping_files.length > 6 && `（另有 ${overlap.overlapping_files.length - 6} 个路径）`}
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

function overlapBadgeClass(
  overlap: ActiveTaskOverlap,
  resolution: OverlapResolutionRow | undefined
): string {
  if (resolution?.action === "paused") return "bg-amber-100 text-amber-800";
  if (resolution) return "bg-green-100 text-green-800";
  if (overlap.severity === "high") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
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
