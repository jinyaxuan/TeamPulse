import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, projects } from "@/db";
import { handler, json, parseBody, requireAuth } from "@/lib/api";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const resolveSchema = z.object({
  git_remote_hash: z.string().regex(/^[a-f0-9]{64}$/, "expected sha256 hex"),
  git_remote_url: z.string().max(512).optional(),
});

/**
 * POST /api/v1/projects/resolve
 * Upsert a project by its git remote hash. Plugin calls this whenever it
 * needs a project_id for the current cwd. Returns { project_id, display_name }.
 */
export const POST = handler(async (request) => {
  await requireAuth(request);
  const body = await parseBody(request, resolveSchema);

  const display = deriveDisplayName(body.git_remote_url);

  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.gitRemoteHash, body.git_remote_hash))
    .limit(1);

  if (existing) {
    return json({
      project_id: existing.id,
      display_name: existing.displayName,
      created: false,
    });
  }

  const [created] = await db
    .insert(projects)
    .values({
      gitRemoteHash: body.git_remote_hash,
      displayName: display,
    })
    .returning();

  return json({
    project_id: created.id,
    display_name: created.displayName,
    created: true,
  });
});

/**
 * Best-effort: extract "owner/repo" or "repo" from URL. E.g.
 *   https://github.com/alice/frontend.git → "alice/frontend"
 *   git@github.com:alice/frontend.git     → "alice/frontend"
 */
function deriveDisplayName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const ownerRepo = cleaned.match(/[:/]([^:/]+\/[^:/]+)$/);
  if (ownerRepo) return ownerRepo[1];
  const repoOnly = cleaned.match(/[:/]([^:/]+)$/);
  return repoOnly?.[1];
}
