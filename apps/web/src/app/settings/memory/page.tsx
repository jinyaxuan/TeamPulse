import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db, memoryBlobs, projects } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { formatRelativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MemoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({
      project_id: memoryBlobs.projectId,
      project_name: projects.displayName,
      version: memoryBlobs.version,
      updated_at: memoryBlobs.updatedAt,
      updated_device: memoryBlobs.updatedDevice,
      size: memoryBlobs.content,
    })
    .from(memoryBlobs)
    .innerJoin(projects, eq(memoryBlobs.projectId, projects.id))
    .where(eq(memoryBlobs.userId, user.id))
    .orderBy(desc(memoryBlobs.updatedAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Memory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your cross-device <code className="rounded bg-muted px-1 font-mono text-xs">MEMORY.md</code> sync for each project.
          The Claude Code plugin pushes on session end and pulls on session start.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          No memory synced yet. Edit <code className="rounded bg-muted px-1">~/.claude/projects/&lt;repo&gt;/memory/MEMORY.md</code>{" "}
          in a Claude Code session and it'll show up here.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Project</th>
                <th className="px-4 py-2 text-left">Version</th>
                <th className="px-4 py-2 text-left">Size</th>
                <th className="px-4 py-2 text-left">Updated</th>
                <th className="px-4 py-2 text-left">From device</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.project_id} className="border-b last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/projects/${m.project_id}`}
                      className="font-medium hover:underline"
                    >
                      {m.project_name ?? "(unnamed)"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">v{m.version}</td>
                  <td className="px-4 py-2 text-muted-foreground">{humanSize(m.size.length)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatRelativeTime(m.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {m.updated_device ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/api/v1/memory/${m.project_id}/download`}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
                    >
                      Download
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
