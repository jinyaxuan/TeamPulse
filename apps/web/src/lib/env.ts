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
};
