import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { db, devices, users, webSessions, type User } from "@/db";
import { env } from "./env";

const SESSION_DAYS = 30;
const TOKEN_PREFIX = "tp_tok_";

// ---------- Password hashing (Argon2id) ----------

export async function hashPassword(password: string): Promise<string> {
  return argonHash(password, {
    memoryCost: 19456, // 19 MB
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

// ---------- Web session (cookie-based) ----------

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = newSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(webSessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(webSessions).where(eq(webSessions.id, id));
}

export async function setSessionCookie(id: string, expiresAt: Date): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set(env.SESSION_COOKIE_NAME, id, {
    httpOnly: true,
    secure: env.PUBLIC_APP_URL.startsWith("https://"),
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.delete(env.SESSION_COOKIE_NAME);
}

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = cookies();
  const sid = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!sid) return null;

  const rows = await db
    .select({
      user: users,
    })
    .from(webSessions)
    .innerJoin(users, eq(webSessions.userId, users.id))
    .where(and(eq(webSessions.id, sid), gt(webSessions.expiresAt, new Date()), isNull(users.revokedAt)))
    .limit(1);

  return rows[0]?.user ?? null;
}

// ---------- Bearer token (CLI plugin) ----------

export function generateBearerToken(): { token: string; hash: Buffer } {
  const raw = randomBytes(32).toString("base64url");
  const token = `${TOKEN_PREFIX}${raw}`;
  const hash = createHash("sha256").update(token).digest();
  return { token, hash };
}

export function hashBearerToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export async function getUserByBearer(
  token: string
): Promise<{ user: User; deviceId: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  const tokenHash = hashBearerToken(token);

  const rows = await db
    .select({ user: users, deviceId: devices.id })
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(
      and(
        eq(devices.tokenHash, tokenHash),
        eq(devices.status, "active"),
        isNull(users.revokedAt)
      )
    )
    .limit(1);

  if (!rows[0]) return null;

  // Update last_used_at (fire-and-forget; errors ignored).
  db.update(devices)
    .set({ lastUsedAt: new Date() })
    .where(eq(devices.id, rows[0].deviceId))
    .catch(() => {});

  return rows[0];
}

// ---------- Unified auth for route handlers ----------

export type AuthContext = {
  user: User;
  source: "session" | "bearer";
  deviceId?: string;
};

/**
 * Resolves the current request's authenticated user from either a session
 * cookie (web browser) or a Bearer token (CLI / plugin). Returns null if
 * neither is valid.
 */
export async function getAuthFromRequest(request: Request): Promise<AuthContext | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length).trim();
    const result = await getUserByBearer(token);
    if (result) {
      return { user: result.user, source: "bearer", deviceId: result.deviceId };
    }
  }

  const sessionUser = await getSessionUser();
  if (sessionUser) {
    return { user: sessionUser, source: "session" };
  }

  return null;
}

export function requireAdmin(ctx: AuthContext): void {
  if (ctx.user.role !== "admin") {
    throw new AuthError("需要管理员权限", 403);
  }
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ---------- Device secret helpers ----------

export function hashDeviceSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function generateClaimCode(): string {
  // 6-char uppercase hex, hyphen-separated as AB-CD-EF for readability.
  const raw = randomBytes(3).toString("hex").toUpperCase();
  return `${raw.slice(0, 2)}-${raw.slice(2, 4)}-${raw.slice(4, 6)}`;
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

// ---------- Invite code helpers ----------

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashInviteCode(code: string): Buffer {
  return createHash("sha256").update(normalizeInviteCode(code)).digest();
}

export function generateInviteCode(): string {
  const raw = randomBytes(9)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .padEnd(12, "0")
    .slice(0, 12);

  return `TP-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// Re-export for convenience; kept minimal.
export { sql };
