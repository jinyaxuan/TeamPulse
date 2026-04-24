import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/auth";
import { listProjectsWithStats } from "@/lib/project-stats";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rows = await listProjectsWithStats();

  return (
    <AppShell user={user} activeNav="projects">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <div className="overflow-hidden rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Project</th>
                <th className="px-4 py-2 text-left">Last activity</th>
                <th className="px-4 py-2 text-left">Active now</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    No projects registered yet. Install the Claude Code plugin and open
                    a git repo to auto-register.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium hover:text-foreground hover:underline"
                    >
                      {p.display_name ?? "(unnamed)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.last_activity ? formatRelativeTime(p.last_activity) : "never"}
                  </td>
                  <td className="px-4 py-2">
                    {p.active_count > 0 ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {p.active_count} active
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
