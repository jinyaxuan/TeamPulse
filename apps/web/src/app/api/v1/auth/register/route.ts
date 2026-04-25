import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, inviteCodes, users } from "@/db";
import { ApiError, handler, json, parseBody } from "@/lib/api";
import { createSession, hashInviteCode, hashPassword, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const registerSchema = z.object({
  invite_code: z.string().trim().min(1).max(64),
  name: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, "用户名只能包含字母、数字、下划线和短横线"),
  display_name: z.string().trim().min(1).max(128).optional(),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

export const POST = handler(async (request) => {
  const body = await parseBody(request, registerSchema);
  const now = new Date();
  const codeHash = hashInviteCode(body.invite_code);
  const passwordHash = await hashPassword(body.password);
  const userName = body.name.toLowerCase();

  const [created] = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.name, userName), eq(users.email, body.email)))
      .limit(1);

    if (existing) {
      throw new ApiError("用户名或邮箱已被占用", 409);
    }

    const [usedInvite] = await tx
      .update(inviteCodes)
      .set({
        uses: sql`${inviteCodes.uses} + 1`,
        lastUsedAt: now,
      })
      .where(
        and(
          eq(inviteCodes.codeHash, codeHash),
          isNull(inviteCodes.revokedAt),
          or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, now)),
          sql`${inviteCodes.uses} < ${inviteCodes.maxUses}`
        )
      )
      .returning({ id: inviteCodes.id });

    if (!usedInvite) {
      throw new ApiError("邀请码无效、已过期或已用完", 400);
    }

    return tx
      .insert(users)
      .values({
        name: userName,
        displayName: body.display_name ?? userName,
        email: body.email,
        passwordHash,
        role: "member",
      })
      .returning();
  });

  const session = await createSession(created.id);
  await setSessionCookie(session.id, session.expiresAt);

  return json({
    user: {
      id: created.id,
      name: created.name,
      display_name: created.displayName,
      email: created.email,
      role: created.role,
    },
  });
});
