import { desc } from "drizzle-orm";
import { z } from "zod";
import { db, inviteCodes } from "@/db";
import { handler, json, parseBody, requireAdminAuth } from "@/lib/api";
import { generateInviteCode, hashInviteCode } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createInviteSchema = z.object({
  label: z.string().trim().max(128).optional(),
  max_uses: z.number().int().min(1).max(1000).default(1),
  expires_at: z.string().datetime().optional(),
});

export const GET = handler(async (request) => {
  await requireAdminAuth(request);

  const rows = await db
    .select({
      id: inviteCodes.id,
      label: inviteCodes.label,
      max_uses: inviteCodes.maxUses,
      uses: inviteCodes.uses,
      created_at: inviteCodes.createdAt,
      expires_at: inviteCodes.expiresAt,
      last_used_at: inviteCodes.lastUsedAt,
      revoked_at: inviteCodes.revokedAt,
    })
    .from(inviteCodes)
    .orderBy(desc(inviteCodes.createdAt));

  return json({ invite_codes: rows });
});

export const POST = handler(async (request) => {
  const ctx = await requireAdminAuth(request);
  const body = await parseBody(request, createInviteSchema);
  const code = generateInviteCode();

  const [created] = await db
    .insert(inviteCodes)
    .values({
      codeHash: hashInviteCode(code),
      label: body.label || null,
      maxUses: body.max_uses,
      createdBy: ctx.user.id,
      expiresAt: body.expires_at ? new Date(body.expires_at) : null,
    })
    .returning({
      id: inviteCodes.id,
      label: inviteCodes.label,
      max_uses: inviteCodes.maxUses,
      uses: inviteCodes.uses,
      created_at: inviteCodes.createdAt,
      expires_at: inviteCodes.expiresAt,
      last_used_at: inviteCodes.lastUsedAt,
      revoked_at: inviteCodes.revokedAt,
    });

  return json({ invite_code: { ...created, code } }, { status: 201 });
});
