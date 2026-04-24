import { and, desc, eq, gt } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";
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

  return (
    <AppShell user={user} activeNav="projects">
      <div className="space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Project</div>
          <h1 className="mt-1 text-2xl font-semibold">{project.displayName ?? "(unnamed project)"}</h1>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {project.gitRemoteHash.slice(0, 16)}…
          </div>
        </div>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Active Now ({active.length})
          </h2>
          <div className="mt-3 space-y-2">
            {active.length === 0 && (
              <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                Nobody active right now.
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
                      {t.branch && ` · branch:${t.branch}`}
                    </div>
                    {t.files_touched.length > 0 && (
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {t.files_touched.slice(0, 5).join(", ")}
                        {t.files_touched.length > 5 && ` (+${t.files_touched.length - 5} more)`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent Activity — Last 7 Days
          </h2>
          <div className="mt-3 overflow-hidden rounded-md border bg-card">
            {recent.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">No recent history.</div>
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
                    {t.status}
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
