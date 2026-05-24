import { eq, isNull, and, or } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { handler, json, parseBody, ApiError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export const POST = handler(async (request) => {
  const rateLimited = checkRateLimit(request, "login", 10, 15 * 60 * 1000);
  if (rateLimited) return rateLimited;

  const { email, password } = await parseBody(request, loginSchema);

  const [localUser] = await db
    .select()
    .from(users)
    .where(and(
      or(eq(users.email, email), eq(users.name, email)),
      isNull(users.revokedAt),
    ))
    .limit(1);

  if (localUser?.passwordHash) {
    const ok = await verifyPassword(password, localUser.passwordHash);
    if (ok) {
      const session = await createSession(localUser.id);
      await setSessionCookie(session.id, session.expiresAt);
      return json({
        user: { id: localUser.id, name: localUser.name, displayName: localUser.displayName, email: localUser.email, role: localUser.role },
      });
    }
  }

  throw new ApiError("账号或密码不正确", 401);
});
