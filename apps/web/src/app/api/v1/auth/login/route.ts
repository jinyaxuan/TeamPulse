import { eq, isNull, and } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { handler, json, parseBody, ApiError } from "@/lib/api";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const POST = handler(async (request) => {
  const { email, password } = await parseBody(request, loginSchema);

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.revokedAt)))
    .limit(1);

  if (!user || !user.passwordHash) {
    throw new ApiError("Invalid credentials", 401);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    throw new ApiError("Invalid credentials", 401);
  }

  const session = await createSession(user.id);
  await setSessionCookie(session.id, session.expiresAt);

  return json({
    user: {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
    },
  });
});
