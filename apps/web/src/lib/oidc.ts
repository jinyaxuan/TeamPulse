import { Buffer } from "node:buffer";
import { env } from "@/lib/env";

type OidcMetadata = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  token_endpoint_auth_methods_supported?: string[];
};

export function oidcRedirectUri() {
  return `${env.PUBLIC_APP_URL}/api/v1/auth/oidc/callback`;
}

export async function getOidcMetadata(): Promise<OidcMetadata> {
  if (!env.OIDC_ISSUER) {
    throw new Error("OIDC issuer is not configured");
  }

  const issuer = env.OIDC_ISSUER.replace(/\/+$/, "");
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OIDC discovery failed with status ${response.status}`);
  }

  const metadata = (await response.json()) as Partial<OidcMetadata>;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
    throw new Error("OIDC discovery response is missing required endpoints");
  }

  return metadata as OidcMetadata;
}

export function buildOidcTokenRequest(metadata: OidcMetadata, code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oidcRedirectUri(),
    client_id: env.OIDC_CLIENT_ID,
  });
  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
  });

  if (env.OIDC_CLIENT_SECRET) {
    const supportedMethods = metadata.token_endpoint_auth_methods_supported ?? [];
    const usePostSecret =
      supportedMethods.includes("client_secret_post") ||
      !supportedMethods.includes("client_secret_basic");

    if (usePostSecret) {
      body.set("client_secret", env.OIDC_CLIENT_SECRET);
    } else {
      headers.set(
        "Authorization",
        `Basic ${Buffer.from(`${env.OIDC_CLIENT_ID}:${env.OIDC_CLIENT_SECRET}`).toString("base64")}`
      );
    }
  }

  return { body, headers };
}
