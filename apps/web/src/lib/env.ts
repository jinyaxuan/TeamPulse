/**
 * Typed, lazy access to env vars. We use getters so values are read on first
 * access — this lets scripts load dotenv before importing our lib modules.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Required env var ${key} is not set`);
  }
  return val;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get PUBLIC_APP_URL() {
    return process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
  },
  get SESSION_COOKIE_NAME() {
    return process.env.SESSION_COOKIE_NAME ?? "teampulse_session";
  },
  get OIDC_ISSUER() {
    return process.env.OIDC_ISSUER ?? "";
  },
  get OIDC_CLIENT_ID() {
    return process.env.OIDC_CLIENT_ID ?? "";
  },
  get OIDC_CLIENT_SECRET() {
    return process.env.OIDC_CLIENT_SECRET ?? "";
  },
  get OIDC_ENABLED() {
    return Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
  },
  get XUNHU_APPID() {
    return process.env.XUNHU_APPID ?? "";
  },
  get XUNHU_APPSECRET() {
    return process.env.XUNHU_APPSECRET ?? "";
  },
  get REGISTRATION_MODE() {
    return (process.env.REGISTRATION_MODE ?? "open") as "open" | "invite_only";
  },
  get OPS_GITEA_BASE_URL() {
    return process.env.OPS_GITEA_BASE_URL ?? "https://gitea.tangchaolizi.com";
  },
  get OPS_GITEA_TOKEN() {
    return process.env.OPS_GITEA_TOKEN ?? "";
  },
  get TYPESAFE_API_KEY() {
    return process.env.TYPESAFE_API_KEY ?? "";
  },
  /** OpenAI-compatible local triage endpoint, for example NVIDIA NIM on DGX Spark. */
  get JEV_BASE_URL() {
    return (process.env.JEV_BASE_URL ?? "").replace(/\/$/, "");
  },
  get JEV_MODEL() {
    return process.env.JEV_MODEL ?? "";
  },
  get JEV_API_KEY() {
    return process.env.JEV_API_KEY ?? "";
  },
  get jevConfigured() {
    return Boolean(env.JEV_BASE_URL || env.TYPESAFE_API_KEY);
  },
};
