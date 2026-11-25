// Zorro database schema (SQLite via libsql + Drizzle).
// Holds what the server needs to run bots: who owns which agent wallet,
// the (encrypted) grant token that lets Zorro trade, bots and their activity.
// Funds are never stored here: they live in the user's NEAR Intents agent wallet.

import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date());

/** A person, identified only by their passkey (no email, no password). */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // random UUID
  passkeyCredentialId: text("passkey_credential_id").notNull().unique(), // base64url
  passkeyPublicKey: text("passkey_public_key").notNull(), // P-256 SPKI, base64url (format the Agent API expects)
  rpId: text("rp_id").notNull(),
  origin: text("origin").notNull(),
  createdAt: createdAt(),
});

/** A NEAR Intents agent wallet owned by a user's passkey. */
export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(), // Agent API agent_id
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", { enum: ["PENDING", "ACTIVE", "ARCHIVED", "DELETED", "ABANDONED"] }).notNull(),
    nearAccountId: text("near_account_id"),
    policy: text("policy", { mode: "json" }).$type<Record<string, unknown>>(),
    policyRevision: integer("policy_revision"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agents_user_idx").on(t.userId)],
);

/** Zorro's permission to act for an agent. The token is encrypted at rest. */
export const grants = sqliteTable(
  "grants",
  {
    id: text("id").primaryKey(), // Agent API grant_id
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(), // encrypt(ngt_…)
    tokenHash: text("token_hash").notNull(), // sha256 hex, as registered with the Agent API
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("grants_agent_idx").on(t.agentId)],
);

export const BOT_KINDS = ["smart_dca", "stop_loss", "trailing_stop", "tp_ladder", "grid"] as const;
export const BOT_STATUSES = ["draft", "active", "paused", "stopped", "error"] as const;

/** A strategy running for an agent. Config is validated by the bot engine (Phase 6). */
export const bots = sqliteTable(
  "bots",
  {
    id: text("id").primaryKey(), // random UUID
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: BOT_KINDS }).notNull(),
    name: text("name").notNull(),
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    state: text("state", { mode: "json" }).$type<Record<string, unknown>>(), // e.g. trailing-stop peak price
    status: text("status", { enum: BOT_STATUSES }).notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bots_agent_idx").on(t.agentId), index("bots_status_idx").on(t.status)],
);

/** Human-readable activity log: "Sold 0.5 ZEC at $612 because price fell 10% from its peak". */
export const botEvents = sqliteTable(
  "bot_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    at: createdAt(),
    level: text("level", { enum: ["info", "trade", "warn", "error"] }).notNull(),
    message: text("message").notNull(),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>(),
    correlationId: text("correlation_id"),
  },
  (t) => [index("bot_events_bot_at_idx").on(t.botId, t.at)],
);

/**
 * Every money action sent to the Agent API. The Idempotency-Key makes retries
 * safe: after a crash we resend with the same key instead of trading twice.
 */
export const operations = sqliteTable(
  "operations",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    botId: text("bot_id").references(() => bots.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["swap", "limit_order", "cancel", "withdraw", "deposit"] }).notNull(),
    correlationId: text("correlation_id"),
    status: text("status").notNull(), // Agent API status, or "SENDING" before a response
    request: text("request", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    response: text("response", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("operations_correlation_idx").on(t.correlationId), index("operations_agent_idx").on(t.agentId)],
);
