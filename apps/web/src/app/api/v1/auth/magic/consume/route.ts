import { z } from "zod";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, magicLinks, users } from "@/db";
import { ApiError, handler, json, parseBody } from "@/lib/api";
import { createSession, setSessionCookie } from "@/lib/auth";

const consumeSchema = z.object({
  token: z.string().min(1).max(256),
});

/**
 * POST /api/v1/auth/magic/consume
 *
 * Exchanges a magic link token for a web session cookie. Single-use —
 * marks the link as consumed.
 */
export const POST = handler(async (request) => {
  const body = await parseBody(request, consumeSchema);

  const [link] = await db
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.token, body.token),
        gt(magicLinks.expiresAt, new Date()),
        isNull(magicLinks.consumedAt)
      )
    )
    .limit(1);

  if (!link) throw new ApiError("invalid or expired magic link", 401);

  await db
    .update(magicLinks)
    .set({ consumedAt: new Date() })
    .where(eq(magicLinks.token, link.token));

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, link.userId), isNull(users.revokedAt)))
    .limit(1);
  if (!user) throw new ApiError("user no longer valid", 401);

  const session = await createSession(user.id);
  await setSessionCookie(session.id, session.expiresAt);

  return json({ user_id: user.id, name: user.name });
});
