import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, users } from "@/db";
import { createSession, setSessionCookie } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/oidc/callback — Exchange code for token, upsert user, create session.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = cookies();
  const savedState = cookieStore.get("oidc_state")?.value;
  cookieStore.delete("oidc_state");

  if (!code || !state || state !== savedState) {
    return new Response("Invalid OIDC callback", { status: 400 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`${env.OIDC_ISSUER}/api/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${env.PUBLIC_APP_URL}/api/v1/auth/oidc/callback`,
      client_id: env.OIDC_CLIENT_ID,
      client_secret: env.OIDC_CLIENT_SECRET,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("OIDC token exchange failed:", text);
    return new Response("OIDC token exchange failed", { status: 502 });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Fetch user info
  const userInfoRes = await fetch(`${env.OIDC_ISSUER}/api/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userInfoRes.ok) {
    return new Response("Failed to fetch user info", { status: 502 });
  }

  const profile = await userInfoRes.json();
  const oidcName = profile.preferred_username || profile.name || profile.sub;
  const oidcEmail = profile.email || `${oidcName}@oidc.local`;
  const oidcDisplayName = profile.displayName || profile.name || oidcName;

  // Upsert: find existing user by name, or create
  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.name, oidcName), isNull(users.revokedAt)))
    .limit(1);

  let userId: string;

  if (existing) {
    // Update email/displayName if changed
    await db
      .update(users)
      .set({ email: oidcEmail, displayName: oidcDisplayName })
      .where(eq(users.id, existing.id));
    userId = existing.id;
  } else {
    // Auto-create member user from OIDC
    const [newUser] = await db
      .insert(users)
      .values({
        name: oidcName,
        email: oidcEmail,
        displayName: oidcDisplayName,
        role: "member",
      })
      .returning({ id: users.id });
    await db.update(users).set({ teamOwnerId: newUser.id }).where(eq(users.id, newUser.id));
    userId = newUser.id;
  }

  // Create session and redirect to home
  const session = await createSession(userId);
  await setSessionCookie(session.id, session.expiresAt);

  redirect("/");
}
