import { eq, isNull, and, or } from "drizzle-orm";
import { db, users } from "@/db";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { handler, json, parseBody, ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { z } from "zod";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Verify credentials against Casdoor via its login API.
 * Returns user profile on success, null on failure.
 */
async function verifyCasdoor(login: string, password: string) {
  if (!env.OIDC_ISSUER) return null;
  try {
    const res = await fetch(`${env.OIDC_ISSUER}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        application: "app-tangchaolizi",
        organization: "tangchaolizi",
        username: login,
        password,
        type: "login",
      }),
    });
    const body = await res.json();
    if (body.status !== "ok") return null;
    // Fetch user profile with the session
    const name = typeof body.data === "string" ? body.data.split("/").pop() : null;
    if (!name) return null;
    // Get full profile
    const profileRes = await fetch(`${env.OIDC_ISSUER}/api/get-user?id=tangchaolizi/${name}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${env.OIDC_CLIENT_ID}:${env.OIDC_CLIENT_SECRET}`).toString("base64")}` },
    });
    if (!profileRes.ok) return { name, email: `${name}@casdoor.local`, displayName: name };
    const profile = await profileRes.json();
    const u = profile.data ?? profile;
    return {
      name: u.name ?? name,
      email: u.email || `${name}@casdoor.local`,
      displayName: u.displayName || u.name || name,
    };
  } catch {
    return null;
  }
}

export const POST = handler(async (request) => {
  const { email, password } = await parseBody(request, loginSchema);

  // 1. Try local DB first (supports email or username)
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

  // 2. Try Casdoor authentication
  const casdoorProfile = await verifyCasdoor(email, password);
  if (!casdoorProfile) {
    throw new ApiError("账号或密码不正确", 401);
  }

  // 3. Upsert user from Casdoor profile
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.name, casdoorProfile.name), isNull(users.revokedAt)))
    .limit(1);

  let userId: string;
  if (existing) {
    await db.update(users)
      .set({ email: casdoorProfile.email, displayName: casdoorProfile.displayName })
      .where(eq(users.id, existing.id));
    userId = existing.id;
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        name: casdoorProfile.name,
        email: casdoorProfile.email,
        displayName: casdoorProfile.displayName,
        role: "member",
      })
      .returning({ id: users.id });
    userId = newUser.id;
  }

  const session = await createSession(userId);
  await setSessionCookie(session.id, session.expiresAt);

  const finalUser = existing ?? { id: userId, name: casdoorProfile.name, displayName: casdoorProfile.displayName, email: casdoorProfile.email, role: "member" };
  return json({
    user: { id: finalUser.id, name: finalUser.name, displayName: finalUser.displayName, email: finalUser.email, role: finalUser.role },
  });
});
