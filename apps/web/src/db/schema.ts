import { sql } from "drizzle-orm";
import {
  bigint,
  type AnyPgColumn,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
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
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(), // "bob" — admin enters when claiming device
    displayName: text("display_name"),
    email: citext("email"),
    passwordHash: text("password_hash"), // Argon2id; only admins need this
    role: text("role").notNull().default("member"), // 'admin' | 'member'
    teamOwnerId: uuid("team_owner_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("users_team_owner_idx").on(t.teamOwnerId)]
);

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
    agentName: text("agent_name"),
    agentType: text("agent_type"), // codex|claude-code|openclaw|generic
    agentRole: text("agent_role"),
    capabilities: text("capabilities").array().notNull().default(sql`ARRAY[]::text[]`),
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
  jevEnabled: boolean("jev_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Human authorization changes for sending project work-item data to JEV. */
export const projectJevPolicyEvents = pgTable(
  "project_jev_policy_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    source: text("source").notNull(), // web | ops
    oldEnabled: boolean("old_enabled").notNull(),
    newEnabled: boolean("new_enabled").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("project_jev_policy_events_project_created_idx").on(t.projectId, t.createdAt),
    check(
      "project_jev_policy_events_actor_source_check",
      sql`(${t.source} = 'web' AND ${t.actorUserId} IS NOT NULL) OR (${t.source} = 'ops' AND ${t.actorUserId} IS NULL)`
    ),
  ]
);

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
 * task_overlap_resolutions — current coordination decision for an active task pair.
 */
export const taskOverlapResolutions = pgTable(
  "task_overlap_resolutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    firstTaskId: uuid("first_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    secondTaskId: uuid("second_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    action: text("action").notNull(), // acknowledged|handoff|paused
    note: text("note"),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("task_overlap_resolutions_pair_unique").on(t.projectId, t.firstTaskId, t.secondTaskId),
    index("task_overlap_resolutions_project_updated_idx").on(t.projectId, t.updatedAt),
  ]
);

/**
 * project_messages — lightweight agent-to-agent notes scoped to a project.
 */
export const projectMessages = pgTable(
  "project_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    threadKey: text("thread_key").notNull().default("project"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("project_messages_project_created_idx").on(t.projectId, t.createdAt),
    index("project_messages_project_thread_idx").on(t.projectId, t.threadKey, t.createdAt),
    index("project_messages_target_created_idx").on(t.targetUserId, t.createdAt),
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

/**
 * work_items — durable business work, separate from the append-only Agent
 * session activity in `tasks`.
 */
export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => workItems.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull().default("task"), // requirement | task
    title: text("title").notNull(),
    description: text("description"),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: text("status").notNull().default("intake"),
    priority: text("priority").notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    assigneeDeviceId: uuid("assignee_device_id").references(() => devices.id, { onDelete: "set null" }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewerDeviceId: uuid("reviewer_device_id").references(() => devices.id, { onDelete: "set null" }),
    reviewPolicy: text("review_policy").notNull().default("both"), // human | agent | both
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    submissionAttempt: integer("submission_attempt").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    index("work_items_project_status_idx").on(t.projectId, t.status, t.updatedAt),
    index("work_items_parent_idx").on(t.parentId),
    index("work_items_assignee_idx").on(t.assigneeUserId, t.status),
  ]
);

/** Existing Agent execution sessions attached to durable work. */
export const workItemSessions = pgTable(
  "work_item_sessions",
  {
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    linkedBy: uuid("linked_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workItemId, t.taskId] }),
    index("work_item_sessions_task_idx").on(t.taskId),
  ]
);

/** Append-only lifecycle and evidence audit trail. */
export const workItemEvents = pgTable(
  "work_item_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorDeviceId: uuid("actor_device_id").references(() => devices.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("work_item_events_item_created_idx").on(t.workItemId, t.createdAt),
    index("work_item_events_type_idx").on(t.eventType, t.createdAt),
    index("work_item_events_actor_type_created_idx").on(t.actorUserId, t.eventType, t.createdAt),
  ]
);

/** Immutable human/Agent acceptance decisions. */
export const acceptanceReviews = pgTable(
  "acceptance_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    reviewerUserId: uuid("reviewer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewerDeviceId: uuid("reviewer_device_id").references(() => devices.id, { onDelete: "set null" }),
    reviewerKind: text("reviewer_kind").notNull(), // human | agent
    submissionAttempt: integer("submission_attempt").notNull(),
    decision: text("decision").notNull(), // approved | changes_requested
    criterionResults: jsonb("criterion_results")
      .$type<Record<string, boolean>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("acceptance_reviews_item_created_idx").on(t.workItemId, t.createdAt),
    index("acceptance_reviews_reviewer_idx").on(t.reviewerUserId, t.createdAt),
  ]
);

/** Curated project knowledge with provenance back to accepted work events. */
export const knowledgeRecords = pgTable(
  "knowledge_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workItemId: uuid("work_item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    sourceEventIds: uuid("source_event_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    status: text("status").notNull().default("draft"), // draft | published | archived
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("knowledge_records_project_status_idx").on(t.projectId, t.status, t.updatedAt),
    index("knowledge_records_work_item_idx").on(t.workItemId),
  ]
);

/**
 * plans — pricing tiers (seeded, rarely changes).
 * Prices stored in fen (分): ¥49.00 = 4900.
 */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // "free" | "pro" | "enterprise"
  name: text("name").notNull(), // "免费版" | "专业版" | "企业版"
  description: text("description"),
  priceMonthly: integer("price_monthly").notNull().default(0), // in fen (分)
  maxMembers: integer("max_members").notNull().default(2),
  maxProjects: integer("max_projects").notNull().default(3),
  maxDevicesPerUser: integer("max_devices_per_user").notNull().default(1),
  featuresJson: text("features_json"), // JSON array of feature flags
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * subscriptions — one active subscription per admin user (governs the instance).
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status").notNull().default("active"), // active | expired | cancelled
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_status_idx").on(t.status),
  ]
);

/**
 * orders — payment records linked to XunhuPay transactions.
 * Amounts in fen (分).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    tradeOrderId: text("trade_order_id").notNull().unique(), // our order ID sent to XunhuPay
    amount: integer("amount").notNull(), // in fen (分)
    months: integer("months").notNull().default(1),
    title: text("title").notNull(), // "TeamPulse 专业版 - 1个月"
    status: text("status").notNull().default("pending"), // pending | paid | failed | refunded
    paymentChannel: text("payment_channel"), // "wechat" | "alipay"
    xunhuOrderId: text("xunhu_order_id"), // XunhuPay's order ID from callback
    paidAt: timestamp("paid_at", { withTimezone: true }),
    callbackRaw: text("callback_raw"), // full callback JSON for audit
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("orders_user_idx").on(t.userId),
    index("orders_trade_order_idx").on(t.tradeOrderId),
    index("orders_status_idx").on(t.status),
  ]
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
export type TaskOverlapResolution = typeof taskOverlapResolutions.$inferSelect;
export type ProjectMessage = typeof projectMessages.$inferSelect;
export type MemoryBlob = typeof memoryBlobs.$inferSelect;
export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;
export type WorkItemSession = typeof workItemSessions.$inferSelect;
export type WorkItemEvent = typeof workItemEvents.$inferSelect;
export type AcceptanceReview = typeof acceptanceReviews.$inferSelect;
export type KnowledgeRecord = typeof knowledgeRecords.$inferSelect;
export type WebSession = typeof webSessions.$inferSelect;
export type MagicLink = typeof magicLinks.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
