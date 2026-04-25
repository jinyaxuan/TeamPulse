import { and, desc, eq, gt } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { findActiveTaskOverlaps, type ActiveTaskOverlap, type OverlapReason } from "@/lib/task-overlap";
import { formatRelativeTime, taskStatusLabel } from "@/lib/utils";
import { ProjectLiveUpdates } from "./project-live";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
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

  const activeOverlaps = findActiveTaskOverlaps(active);

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
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-md border bg-background px-3 py-2">
                当前进行中 <strong className="ml-1 text-foreground">{active.length}</strong>
              </span>
              <span className="rounded-md border bg-background px-3 py-2">
                7 天记录 <strong className="ml-1 text-foreground">{recent.length}</strong>
              </span>
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            当前进行中 ({active.length})
          </h2>
          <div className="mt-3 space-y-2">
            {active.length === 0 && (
              <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                当前没有成员在这个项目上工作。
              </div>
            )}
            {active.map((t) => (
              <div key={t.id} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.intent}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t.user_display_name ?? t.user_name}
                      {" · "}
                      {formatRelativeTime(t.started_at)}
                      {t.branch && ` · 分支：${t.branch}`}
                    </div>
                    {t.files_touched.length > 0 && (
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {t.files_touched.slice(0, 5).join(", ")}
                        {t.files_touched.length > 5 && `（另有 ${t.files_touched.length - 5} 个文件）`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {activeOverlaps.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
              潜在重叠 ({activeOverlaps.length})
            </h2>
            <div className="mt-3 space-y-2">
              {activeOverlaps.map((overlap) => (
                <OverlapAlert key={`${overlap.first.task_id}:${overlap.second.task_id}`} overlap={overlap} />
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
                <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-sm">
                  <div className="w-24 flex-shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(t.started_at)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate">
                      <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                      <span className="text-muted-foreground"> — {t.intent}</span>
                    </div>
                  </div>
                  <div
                    className={
                      "flex-shrink-0 rounded-full px-2 py-0.5 text-xs " +
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

function OverlapAlert({ overlap }: { overlap: ActiveTaskOverlap }) {
  const firstName = overlap.first.user_display_name ?? overlap.first.user_name;
  const secondName = overlap.second.user_display_name ?? overlap.second.user_name;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-medium">
            {firstName} 和 {secondName} 可能在处理同一块内容
          </div>
          <div className="mt-1 text-xs text-amber-800">
            {overlapReasonLabel(overlap.reasons)}
            {overlap.first.branch && overlap.reasons.includes("branch") && ` · 分支：${overlap.first.branch}`}
          </div>
        </div>
        <span
          className={
            "w-fit rounded-full px-2 py-0.5 text-xs font-medium " +
            (overlap.severity === "high"
              ? "bg-red-100 text-red-800"
              : "bg-amber-100 text-amber-800")
          }
        >
          {overlap.severity === "high" ? "高风险" : "需确认"}
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
  return labels.join("、");
}
