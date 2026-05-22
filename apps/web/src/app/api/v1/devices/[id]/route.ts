import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, devices } from "@/db";
import { ApiError, handler, json, parseBody, requireAuth } from "@/lib/api";
import { publishPresence } from "@/lib/presence";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateAgentSchema = z.object({
  agent_name: z.string().trim().min(1).max(128).optional().nullable(),
  agent_type: z.enum(["codex", "claude-code", "openclaw", "generic"]).optional().nullable(),
  agent_role: z.string().trim().max(500).optional().nullable(),
  capabilities: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});

/**
 * PATCH /api/v1/devices/:id
 * Updates human-facing Agent metadata on a device. Owners can update their own
 * devices; admins can update any device. Token fields and ownership are never
 * accepted from the request body.
 */
export const PATCH = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, updateAgentSchema);

  const [device] = await db.select().from(devices).where(eq(devices.id, params.id)).limit(1);
  if (!device) throw new ApiError("设备不存在", 404);
  if (device.userId !== ctx.user.id && ctx.user.role !== "admin") {
    throw new ApiError("只能编辑自己的 Agent 设备", 403);
  }

  const updates: Partial<typeof devices.$inferInsert> = {};
  if (body.agent_name !== undefined) updates.agentName = body.agent_name || null;
  if (body.agent_type !== undefined) updates.agentType = body.agent_type || null;
  if (body.agent_role !== undefined) updates.agentRole = body.agent_role || null;
  if (body.capabilities !== undefined) updates.capabilities = uniqueCapabilities(body.capabilities);

  if (Object.keys(updates).length === 0) {
    return json({ updated: false });
  }

  const [updated] = await db
    .update(devices)
    .set(updates)
    .where(eq(devices.id, device.id))
    .returning({
      id: devices.id,
      agent_name: devices.agentName,
      agent_type: devices.agentType,
      agent_role: devices.agentRole,
      capabilities: devices.capabilities,
    });

  return json({ updated: true, device: updated });
});

/**
 * DELETE /api/v1/devices/:id
 * A user (session or bearer) can revoke their own device.
 * Admins can revoke any device — but they should use /api/v1/admin/devices/:id/revoke
 * which has richer bookkeeping. This endpoint is just for self-service.
 */
export const DELETE = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAuth(request);

  const [device] = await db
    .select()
    .from(devices)
    .where(eq(devices.id, params.id))
    .limit(1);
  if (!device) throw new ApiError("设备不存在", 404);

  if (device.userId !== ctx.user.id && ctx.user.role !== "admin") {
    throw new ApiError("只能撤销自己的设备", 403);
  }

  await db
    .update(devices)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      tokenHash: null,
      pendingToken: null,
      claimCode: null,
    })
    .where(and(eq(devices.id, device.id)));

  return json({ device_id: device.id, status: "revoked" });
});

// Suppress unused import warning if publishPresence isn't used anywhere else.
void publishPresence;

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
