import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, memoryBlobs } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { canWriteProject, getVisibleProject } from "@/lib/project-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const MAX_MEMORY_BYTES = 512 * 1024; // 512 KB; internal-tool scope

const putSchema = z.object({
  content: z.string().max(MAX_MEMORY_BYTES),
  device_name: z.string().max(128).optional(),
});

/**
 * GET /api/v1/memory/:projectId
 * Returns the caller's memory blob for this project, or 404 if none exists.
 * ETag is the current version number so clients can skip downloads when up-to-date.
 */
export const GET = handler<{ projectId: string }>(async (request, params) => {
  const ctx = await requireAuth(request);

  const proj = await getVisibleProject(params.projectId, ctx.user);
  if (!proj) throw new ApiError("项目不存在", 404);

  const [blob] = await db
    .select()
    .from(memoryBlobs)
    .where(
      and(eq(memoryBlobs.userId, ctx.user.id), eq(memoryBlobs.projectId, params.projectId))
    )
    .limit(1);

  if (!blob) {
    return new Response(null, { status: 404 });
  }

  const clientEtag = request.headers.get("if-none-match");
  const etag = `"${blob.version}"`;
  if (clientEtag === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return json(
    {
      content: blob.content,
      version: blob.version,
      updated_at: blob.updatedAt,
      updated_device: blob.updatedDevice,
    },
    { headers: { ETag: etag } }
  );
});

/**
 * PUT /api/v1/memory/:projectId
 *
 * Body: { content, device_name? }
 * Header: If-Match: "<version>"  (mandatory after the first write)
 *
 * Responses:
 *   200 → { version: <new> }       success (version bumped)
 *   201 → { version: 1 }           first write; no If-Match required
 *   409 → { current_version, content, updated_at, updated_device }
 *                                   conflict; client saves its local version
 *                                   as MEMORY.md.conflict-<ts> and overwrites
 *                                   with the server copy returned here.
 */
export const PUT = handler<{ projectId: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, putSchema);

  const proj = await getVisibleProject(params.projectId, ctx.user);
  if (!proj) throw new ApiError("项目不存在", 404);
  if (!(await canWriteProject(params.projectId, ctx.user))) {
    throw new ApiError("你在该项目中是只读角色，不能更新记忆", 403);
  }

  const ifMatch = request.headers.get("if-match");
  const expectedVersion = ifMatch ? Number(ifMatch.replace(/"/g, "")) : null;

  const [existing] = await db
    .select()
    .from(memoryBlobs)
    .where(
      and(eq(memoryBlobs.userId, ctx.user.id), eq(memoryBlobs.projectId, params.projectId))
    )
    .limit(1);

  // First-ever write: no If-Match required, insert version 1.
  if (!existing) {
    const [inserted] = await db
      .insert(memoryBlobs)
      .values({
        userId: ctx.user.id,
        projectId: params.projectId,
        content: body.content,
        version: 1,
        updatedDevice: body.device_name ?? null,
      })
      .returning();
    return json(
      { version: inserted.version },
      { status: 201, headers: { ETag: `"${inserted.version}"` } }
    );
  }

  // Subsequent writes: must provide If-Match equal to current version.
  if (expectedVersion == null) {
    throw new ApiError("更新记忆需要 If-Match 请求头", 428);
  }
  if (existing.version !== expectedVersion) {
    return new Response(
      JSON.stringify({
        current_version: existing.version,
        content: existing.content,
        updated_at: existing.updatedAt,
        updated_device: existing.updatedDevice,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  const [updated] = await db
    .update(memoryBlobs)
    .set({
      content: body.content,
      version: existing.version + 1,
      updatedAt: new Date(),
      updatedDevice: body.device_name ?? existing.updatedDevice,
    })
    .where(
      and(eq(memoryBlobs.userId, ctx.user.id), eq(memoryBlobs.projectId, params.projectId))
    )
    .returning();

  return json({ version: updated.version }, { headers: { ETag: `"${updated.version}"` } });
});
