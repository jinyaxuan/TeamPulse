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
  const activeProjects = rows.filter((p) => p.active_count > 0).length;
  const recentlyTouched = rows.filter((p) => Boolean(p.last_activity)).length;

  return (
    <AppShell user={user} activeNav="projects">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">项目</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              按 Git 仓库聚合团队任务，快速判断哪些项目正在被处理。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:w-72">
            <div className="rounded-md border bg-card p-3">
              <div className="text-muted-foreground">活跃项目</div>
              <div className="mt-1 text-lg font-semibold">{activeProjects}</div>
            </div>
            <div className="rounded-md border bg-card p-3">
              <div className="text-muted-foreground">已有动态</div>
              <div className="mt-1 text-lg font-semibold">{recentlyTouched}</div>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">项目</th>
                <th className="px-4 py-2 text-left">最近动态</th>
                <th className="px-4 py-2 text-left">当前活跃</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    还没有项目。安装 Claude Code 或 Codex 插件后，在 Git 仓库中启动会话即可自动注册。
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
                      {p.display_name ?? "未命名项目"}
                    </Link>
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {p.git_remote_hash.slice(0, 12)}…
                    </div>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.last_activity ? formatRelativeTime(p.last_activity) : "暂无"}
                  </td>
                  <td className="px-4 py-2">
                    {p.active_count > 0 ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {p.active_count} 个进行中
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
