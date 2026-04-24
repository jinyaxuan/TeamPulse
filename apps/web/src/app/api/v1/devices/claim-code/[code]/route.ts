import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db, devices, users } from "@/db";
import { ApiError, handler, json, parseBody } from "@/lib/api";
import { hashDeviceSecret } from "@/lib/auth";
import { env } from "@/lib/env";

const claimCheckSchema = z.object({
  device_secret: z.string().min(32),
});

/**
 * Plugin polls this endpoint every few seconds after registering. The plugin
 * proves it owns the pending device by providing the original device_secret
 * (the server compares sha256 against device_secret_hash).
 *
 * Responses:
 *   - pending  → { status: 'pending' }
 *   - active   → { status: 'active', token, server_url, user: {name, displayName} }
 *   - rejected → { status: 'rejected' }   (admin said no)
 *   - 404      → claim_code doesn't exist / already consumed
 */
export const POST = handler<{ code: string }>(async (request, params) => {
  const body = await parseBody(request, claimCheckSchema);

  // Claim codes are 6 chars + 2 hyphens, uppercased. Normalize just in case.
  const code = params.code.toUpperCase();
  const secretHash = hashDeviceSecret(body.device_secret);

  // We must match both the code AND the device_secret_hash. This prevents
  // a random attacker who guessed a code from polling for the token.
  //
  // After approval, `claim_code` is cleared and the token is in token_hash.
  // So the pre-approval path matches on claim_code; the post-approval path
  // matches on the (unchanged) device_secret_hash alone — we can't key on
  // claim_code once cleared. We do both lookups.

  const [pendingRow] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.claimCode, code), eq(devices.deviceSecretHash, secretHash)))
    .limit(1);

  if (pendingRow) {
    // Still pending approval. Return status.
    if (pendingRow.status === "rejected") {
      return json({ status: "rejected" });
    }
    return json({ status: "pending", device_id: pendingRow.id });
  }

  // If not found by claim_code, try by secret_hash alone — the admin may have
  // approved (which clears claim_code). In that case status='active' and we
  // have a token_hash, but we DON'T return the raw token here — tokens are
  // only returned during the approve step (see admin route).
  //
  // Wait — that's a problem. After approve, the plugin has no way to learn
  // the raw token. We need the approve flow to set a one-time token that the
  // plugin picks up here.
  //
  // Design: admin approval generates the token and stores ONLY sha256 in
  // token_hash. The raw token is also stored temporarily in a short-lived
  // pending_token field — no, simpler: we use a separate pending_tokens table.
  //
  // For simplicity in V1, we keep the raw token on the device row in a
  // short-lived field that's cleared after first successful fetch. This
  // is acceptable because the secret is only retrievable by someone
  // possessing the original device_secret (verified below).

  const [row] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.deviceSecretHash, secretHash), isNull(devices.revokedAt)))
    .limit(1);

  if (!row) {
    throw new ApiError("unknown claim code", 404);
  }

  if (row.status === "rejected") {
    return json({ status: "rejected" });
  }

  if (row.status === "active") {
    // We only mint the token here if pendingToken is set. The admin's approve
    // route populates it. Once the plugin fetches it, we clear.
    if (row.pendingToken) {
      const [user] = await db.select().from(users).where(eq(users.id, row.userId!)).limit(1);
      // Clear the pending token — it's a one-time handoff.
      await db.update(devices).set({ pendingToken: null }).where(eq(devices.id, row.id));
      return json({
        status: "active",
        token: row.pendingToken,
        server_url: env.PUBLIC_APP_URL,
        user: {
          id: user?.id,
          name: user?.name,
          display_name: user?.displayName,
        },
      });
    }
    // Already consumed — plugin should already have creds saved.
    return json({ status: "active_already_consumed" });
  }

  return json({ status: row.status });
});
