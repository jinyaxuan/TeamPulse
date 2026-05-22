import { z } from "zod";
import { db, devices } from "@/db";
import { handler, json, parseBody } from "@/lib/api";
import { generateClaimCode, generateDeviceSecret, hashDeviceSecret } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const registerSchema = z.object({
  claim_code: z
    .string()
    .regex(/^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{2}$/, "claim_code must look like AB-CD-EF")
    .optional(),
  device_secret: z.string().min(32).optional(),
  hostname: z.string().max(128).optional(),
  os: z.string().max(32).optional(),
  git_email: z.string().email().max(256).optional(),
  agent_name: z.string().trim().min(1).max(128).optional(),
  agent_type: z.enum(["codex", "claude-code", "openclaw", "generic"]).optional(),
  agent_role: z.string().trim().max(500).optional(),
  capabilities: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

/**
 * Called once by the plugin the first time it runs on a new machine.
 * Creates a pending device row that can be claimed from /settings/connect.
 * Generic agents can call this endpoint directly with curl; in that case the
 * server generates both the claim code and device secret and returns them once.
 */
export const POST = handler(async (request) => {
  const rateLimited = checkRateLimit(request, "device-register", 20, 60 * 60 * 1000);
  if (rateLimited) return rateLimited;

  const body = await parseBody(request, registerSchema);
  const deviceSecret = body.device_secret ?? generateDeviceSecret();

  // Collision handling: if the plugin's claim_code collides with an existing
  // pending code (astronomically rare), just generate a server-side one instead
  // of rejecting. The plugin will see server_claim_code in the response.
  let claimCode = body.claim_code ?? generateClaimCode();
  for (let i = 0; i < 5; i++) {
    try {
      const [row] = await db
        .insert(devices)
        .values({
          claimCode: claimCode,
          deviceSecretHash: hashDeviceSecret(deviceSecret),
          hostname: body.hostname,
          os: body.os,
          gitEmail: body.git_email,
          agentName: body.agent_name,
          agentType: body.agent_type,
          agentRole: body.agent_role,
          capabilities: uniqueCapabilities(body.capabilities ?? []),
          status: "pending",
        })
        .returning({ id: devices.id, claimCode: devices.claimCode });
      return json({
        device_id: row.id,
        claim_code: row.claimCode,
        device_secret: deviceSecret,
        status: "pending",
      });
    } catch (err) {
      // Likely unique-violation on claim_code; retry with new code.
      claimCode = generateClaimCode();
      if (i === 4) throw err;
    }
  }
  // Unreachable.
  return json({ error: "设备注册失败" }, { status: 500 });
});

function uniqueCapabilities(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
