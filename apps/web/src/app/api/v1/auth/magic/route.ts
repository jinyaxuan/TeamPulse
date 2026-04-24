import { randomBytes } from "node:crypto";
import { db, magicLinks } from "@/db";
import { handler, json, requireAuth } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * POST /api/v1/auth/magic
 *
 * Auth: bearer token (from the plugin).
 *
 * Creates a one-time, 10-minute URL the user can open in a browser to
 * become logged in. The MCP tool `teampulse_web_login()` calls this and
 * surfaces the URL to Claude, who tells the user to click it.
 */
export const POST = handler(async (request) => {
  const ctx = await requireAuth(request);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(magicLinks).values({
    token,
    userId: ctx.user.id,
    expiresAt,
  });

  const url = `${env.PUBLIC_APP_URL}/magic?token=${encodeURIComponent(token)}`;

  return json({
    url,
    expires_at: expiresAt.toISOString(),
  });
});
