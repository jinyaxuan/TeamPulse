import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, inviteCodes, users } from "@/db";
import { ApiError, handler, json, parseBody } from "@/lib/api";
import { createSession, hashInviteCode, hashPassword, setSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const registerSchema = z.object({
  invite_code: z.string().trim().max(64).optional(),
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

/**
 * Sync user to Casdoor so credentials work across all services.
 */
async function syncToCasdoor(name: string, email: string, password: string, displayName: string) {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) return;
  try {
    // Login as admin to get session
    const loginRes = await fetch(`${env.OIDC_ISSUER}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application: "app-tangchaolizi",
        organization: "tangchaolizi",
        username: "admin",
        password: "Wjd123..",
        type: "login",
      }),
    });
    const cookies = loginRes.headers.get("set-cookie") ?? "";
    const sessionCookie = cookies.split(";")[0];

    // Create user in Casdoor
    await fetch(`${env.OIDC_ISSUER}/api/add-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        owner: "tangchaolizi",
        name,
        displayName,
        email,
        password,
        type: "normal-user",
        signupApplication: "teampulse",
      }),
    });
  } catch (err) {
    console.warn("Casdoor sync failed (non-fatal):", err);
  }
}

export const POST = handler(async (request) => {
  const rateLimited = checkRateLimit(request, "register", 5, 60 * 60 * 1000);
  if (rateLimited) return rateLimited;

  const body = await parseBody(request, registerSchema);
  const now = new Date();
  const passwordHash = await hashPassword(body.password);
  const userName = body.name.toLowerCase();
  const isOpenMode = env.REGISTRATION_MODE === "open";
  const hasInviteCode = Boolean(body.invite_code?.trim());

  // In invite_only mode, invite code is mandatory
  if (!isOpenMode && !hasInviteCode) {
    throw new ApiError("当前仅支持邀请码注册", 400);
  }

  const [created] = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.name, userName), eq(users.email, body.email)))
      .limit(1);

    if (existing) {
      throw new ApiError("用户名或邮箱已被占用", 409);
    }

    // Validate invite code if provided
    if (hasInviteCode) {
      const codeHash = hashInviteCode(body.invite_code!);
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

  // Sync to Casdoor (fire-and-forget, non-blocking)
  syncToCasdoor(userName, body.email, body.password, body.display_name ?? userName).catch(() => {});

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
