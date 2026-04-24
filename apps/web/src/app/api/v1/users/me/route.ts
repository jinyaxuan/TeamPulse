import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { handler, json, parseBody, requireAuth, ApiError } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";

const patchSchema = z.object({
  display_name: z.string().trim().min(1).max(128).optional(),
  avatar_url: z.string().url().max(512).optional(),
  current_password: z.string().min(1).max(128).optional(),
  new_password: z.string().min(8).max(128).optional(),
});

/**
 * GET /api/v1/users/me — current user profile.
 */
export const GET = handler(async (request) => {
  const ctx = await requireAuth(request);
  return json({
    user: {
      id: ctx.user.id,
      name: ctx.user.name,
      display_name: ctx.user.displayName,
      email: ctx.user.email,
      role: ctx.user.role,
      avatar_url: ctx.user.avatarUrl,
      has_password: Boolean(ctx.user.passwordHash),
    },
  });
});

/**
 * PATCH /api/v1/users/me — update profile + optional password change.
 *
 * Password change requires current_password verification. Non-admin users
 * without an existing password (magic-link-only accounts) cannot set one
 * here; admins do that for them.
 */
export const PATCH = handler(async (request) => {
  const ctx = await requireAuth(request);
  const body = await parseBody(request, patchSchema);

  const updates: Partial<typeof users.$inferInsert> = {};
  if (body.display_name !== undefined) updates.displayName = body.display_name;
  if (body.avatar_url !== undefined) updates.avatarUrl = body.avatar_url;

  if (body.new_password) {
    if (!ctx.user.passwordHash) {
      throw new ApiError(
        "no password set on this account — ask an admin to set one",
        400
      );
    }
    if (!body.current_password) {
      throw new ApiError("current_password required to change password", 400);
    }
    const ok = await verifyPassword(body.current_password, ctx.user.passwordHash);
    if (!ok) throw new ApiError("current password incorrect", 401);
    updates.passwordHash = await hashPassword(body.new_password);
  }

  if (Object.keys(updates).length === 0) {
    return json({ updated: false });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, ctx.user.id))
    .returning();

  return json({
    updated: true,
    user: {
      id: updated.id,
      name: updated.name,
      display_name: updated.displayName,
      email: updated.email,
      role: updated.role,
      avatar_url: updated.avatarUrl,
    },
  });
});
