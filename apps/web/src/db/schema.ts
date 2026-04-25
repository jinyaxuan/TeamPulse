import { sql } from "drizzle-orm";
import {
  bigint,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// citext: case-insensitive text (PG extension)
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// bytea: raw bytes for token hashes
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

/**
 * users — human identities. admin has password; normal devs may have null password
 * and log in via magic link.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // "bob" — admin enters when claiming device
  displayName: text("display_name"),
  email: citext("email"),
  passwordHash: text("password_hash"), // Argon2id; only admins need this
  role: text("role").notNull().default("member"), // 'admin' | 'member'
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

/**
 * devices — Claude Code plugin instances. Self-register, admin approves,
 * then they hold a bearer token for ongoing requests.
 */
export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimCode: text("claim_code").unique(), // "AB-CD-EF" while pending; NULL after approve
    deviceSecretHash: bytea("device_secret_hash").notNull(), // sha256 of plugin's local secret
    hostname: text("hostname"),
    os: text("os"),
    gitEmail: text("git_email"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash"), // sha256 of bearer token; NULL until approved
    pendingToken: text("pending_token"), // raw token, one-time handoff to plugin; cleared on fetch
    status: text("status").notNull().default("pending"), // pending|active|revoked|rejected
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("devices_pending_idx").on(t.status).where(sql`${t.status} = 'pending'`),
    index("devices_user_idx").on(t.userId),
  ]
);

/**
 * web_sessions — browser cookie sessions.
 */
export const webSessions = pgTable("web_sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * magic_links — one-time tokens for dev web login.
 */
export const magicLinks = pgTable("magic_links", {
  token: text("token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * invite_codes — admin-created registration tickets. The plaintext code is
 * shown once when generated; only sha256 is stored.
 */
export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: bytea("code_hash").notNull(),
    label: text("label"),
    maxUses: integer("max_uses").notNull().default(1),
    uses: integer("uses").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invite_codes_code_hash_unique").on(t.codeHash),
    index("invite_codes_created_at_idx").on(t.createdAt),
  ]
);

/**
 * projects — one per unique git remote.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  gitRemoteHash: text("git_remote_hash").notNull().unique(),
  gitRemoteUrl: text("git_remote_url"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * project_members — users who can see and collaborate in a project.
 */
export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner|member|viewer
    source: text("source").notNull().default("activity"), // resolve|activity|manual
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("project_members_user_idx").on(t.userId, t.projectId),
  ]
);

/**
 * tasks — append-only activity log.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionId: text("session_id").notNull(),
    client: text("client").notNull(), // 'claude-code' | 'codex'
    intent: text("intent").notNull(),
    filesTouched: text("files_touched").array().notNull().default(sql`ARRAY[]::text[]`),
    branch: text("branch"),
    status: text("status").notNull(), // active|done|abandoned
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    summary: text("summary"),
  },
  (t) => [
    index("tasks_project_status_idx").on(t.projectId, t.status, t.heartbeatAt),
    index("tasks_project_started_idx").on(t.projectId, t.startedAt),
    index("tasks_user_started_idx").on(t.userId, t.startedAt),
  ]
);

/**
 * memory_blobs — LWW-synced MEMORY.md per (user, project).
 */
export const memoryBlobs = pgTable(
  "memory_blobs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    version: bigint("version", { mode: "number" }).notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedDevice: text("updated_device"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.projectId] })]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type MemoryBlob = typeof memoryBlobs.$inferSelect;
export type WebSession = typeof webSessions.$inferSelect;
export type MagicLink = typeof magicLinks.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
