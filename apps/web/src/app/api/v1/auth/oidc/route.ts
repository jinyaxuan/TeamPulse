import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getOidcMetadata, oidcRedirectUri } from "@/lib/oidc";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/auth/oidc — Redirect to the configured OIDC provider.
 */
export async function GET() {
  if (!env.OIDC_ENABLED) {
    return new Response("OIDC not configured", { status: 404 });
  }

  const metadata = await getOidcMetadata();
  const state = randomBytes(16).toString("hex");
  const cookieStore = cookies();
  cookieStore.set("oidc_state", state, {
    httpOnly: true,
    secure: env.PUBLIC_APP_URL.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.OIDC_CLIENT_ID,
    redirect_uri: oidcRedirectUri(),
    scope: "openid profile email",
    state,
  });

  redirect(`${metadata.authorization_endpoint}?${params}`);
}
