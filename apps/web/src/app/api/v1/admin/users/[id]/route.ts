import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { ApiError, handler, json, parseBody, requireAdminAuth } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";


const patchSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  display_name: z.string().trim().min(1).max(128).optional(),
  email: z.string().email().optional(),
  new_password: z.string().min(8).max(128).optional(),
});

/**
 * PATCH /api/v1/admin/users/:id — admin changes another user's role,
 * display_name, email, or resets their password.
 */
export const PATCH = handler<{ id: string }>(async (request, params) => {
  const ctx = await requireAdminAuth(request);
  const body = await parseBody(request, patchSchema);

  const [target] = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  if (!target) throw new ApiError("user not found", 404);

  // Prevent admin from demoting themselves — they'd lose access.
  if (body.role === "member" && target.id === ctx.user.id) {
    throw new ApiError("cannot demote yourself", 400);
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (body.role !== undefined) updates.role = body.role;
  if (body.display_name !== undefined) updates.displayName = body.display_name;
  if (body.email !== undefined) updates.email = body.email;
  if (body.new_password) updates.passwordHash = await hashPassword(body.new_password);

  if (Object.keys(updates).length === 0) return json({ updated: false });

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, target.id))
    .returning();

  return json({
    updated: true,
    user: {
      id: updated.id,
      name: updated.name,
      display_name: updated.displayName,
      role: updated.role,
    },
  });
});
