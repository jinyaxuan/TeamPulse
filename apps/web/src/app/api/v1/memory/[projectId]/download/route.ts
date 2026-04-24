import { and, eq } from "drizzle-orm";
import { db, memoryBlobs, projects } from "@/db";
import { requireAuth } from "@/lib/api";

/**
 * GET /api/v1/memory/:projectId/download
 * Returns the user's memory blob as a text/markdown attachment.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    const ctx = await requireAuth(request);
    const { projectId } = await context.params;

    const [blob] = await db
      .select({
        content: memoryBlobs.content,
        project_name: projects.displayName,
      })
      .from(memoryBlobs)
      .innerJoin(projects, eq(memoryBlobs.projectId, projects.id))
      .where(and(eq(memoryBlobs.userId, ctx.user.id), eq(memoryBlobs.projectId, projectId)))
      .limit(1);

    if (!blob) return new Response("Not found", { status: 404 });

    const filename = `MEMORY-${blob.project_name ?? "project"}.md`.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new Response(blob.content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}
