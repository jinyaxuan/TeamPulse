import { and, desc, eq, gt } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, projects, tasks, users } from "@/db";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

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
        gt(tasks.heartbeatAt, activeCutoff)
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
    .where(gt(tasks.startedAt, recentCutoff))
    .orderBy(desc(tasks.startedAt))
    .limit(20);

  return (
    <AppShell user={user} activeNav="home">
      <div className="space-y-10">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            My Active Tasks ({myActive.length})
          </h2>
          <div className="mt-3 space-y-2">
            {myActive.length === 0 && (
              <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
                No active tasks. Start something in Claude Code.
              </div>
            )}
            {myActive.map((t) => (
              <div key={t.id} className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.intent}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <Link
                        href={`/projects/${t.project_id}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {t.project_name ?? "(project)"}
                      </Link>
                      {" · "}
                      {formatRelativeTime(t.started_at)}
                      {t.branch && ` · ${t.branch}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Team Activity — Last 24h
          </h2>
          <div className="mt-3 overflow-hidden rounded-md border bg-card">
            {teamRecent.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No team activity yet. Invite teammates via the admin devices page.
              </div>
            )}
            <ul className="divide-y">
              {teamRecent.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <div className="flex-1 truncate">
                    <span className="font-medium">{t.user_display_name ?? t.user_name}</span>
                    <span className="text-muted-foreground"> — {t.intent}</span>
                  </div>
                  <div className="flex-shrink-0 text-xs text-muted-foreground">
                    <Link
                      href={`/projects/${t.project_id}`}
                      className="hover:text-foreground hover:underline"
                    >
                      {t.project_name ?? ""}
                    </Link>
                    {" · "}
                    <span className={t.status === "active" ? "text-foreground" : ""}>
                      {t.status === "active" ? "active" : formatRelativeTime(t.started_at)}
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
