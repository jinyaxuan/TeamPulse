import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, projects } from "@/db";
import { handler, json, parseBody, requireAuth } from "@/lib/api";
import { ensureProjectMember } from "@/lib/project-access";
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
  const ctx = await requireAuth(request);
  const body = await parseBody(request, resolveSchema);

  const remoteUrl = normalizeRemoteUrl(body.git_remote_url);
  const display = deriveDisplayName(remoteUrl);

  const [existing] = await db
    .select()
    .from(projects)
    .where(eq(projects.gitRemoteHash, body.git_remote_hash))
    .limit(1);

  if (existing) {
    const updates: Partial<typeof projects.$inferInsert> = {};
    if (remoteUrl && existing.gitRemoteUrl !== remoteUrl) updates.gitRemoteUrl = remoteUrl;
    if (display && !existing.displayName) updates.displayName = display;

    const [updated] =
      Object.keys(updates).length > 0
        ? await db.update(projects).set(updates).where(eq(projects.id, existing.id)).returning()
        : [existing];

    await ensureProjectMember(updated.id, ctx.user.id, "resolve");

    return json({
      project_id: updated.id,
      display_name: updated.displayName,
      created: false,
    });
  }

  const [created] = await db
    .insert(projects)
    .values({
      gitRemoteHash: body.git_remote_hash,
      gitRemoteUrl: remoteUrl,
      displayName: display,
    })
    .returning();

  await ensureProjectMember(created.id, ctx.user.id, "resolve");

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
function normalizeRemoteUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  return trimmed || undefined;
}

function deriveDisplayName(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const ownerRepo = cleaned.match(/[:/]([^:/]+\/[^:/]+)$/);
  if (ownerRepo) return ownerRepo[1];
  const repoOnly = cleaned.match(/[:/]([^:/]+)$/);
  return repoOnly?.[1];
}
