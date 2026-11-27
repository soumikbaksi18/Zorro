// Zorro database schema (SQLite via libsql + Drizzle).
// Holds what the server needs to run payments: who owns which wallet, the (encrypted)
// grant token that lets Zorro pay within the owner's rules, payees, payments, Autopay
// schedules and get-paid requests. Funds are never stored here: they live in the
// user's NEAR Intents wallet.

import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  passkeyPublicKeyCose: text("passkey_public_key_cose").notNull(), // base64url, for verifying Zorro sign-ins
  passkeyCounter: integer("passkey_counter").notNull().default(0),
  passkeyTransports: text("passkey_transports", { mode: "json" }).$type<string[]>(),
  rpId: text("rp_id").notNull(),
  origin: text("origin").notNull(),
  /** Public @handle so other Zorro users can pay them (optional, unique). */
  handle: text("handle").unique(),
  createdAt: createdAt(),
});

/** Signed-in sessions. The cookie holds a random token; only its SHA-256 is stored. */
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time WebAuthn challenges for passkey sign-up and sign-in (deleted on use). */
export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  purpose: text("purpose", { enum: ["register", "login"] }).notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Owner intents waiting for the user's passkey signature. For agent_create it also
 * holds the new grant token (encrypted) until the agent is confirmed.
 */
export const pendingIntents = sqliteTable(
  "pending_intents",
  {
    correlationId: text("correlation_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    type: text("type").notNull(),
    intent: text("intent", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    policy: text("policy", { mode: "json" }).$type<Record<string, unknown>>(),
    grantId: text("grant_id"),
    grantLabel: text("grant_label"),
    grantTokenCiphertext: text("grant_token_ciphertext"),
    grantTokenHash: text("grant_token_hash"),
    grantExpiresAt: integer("grant_expires_at", { mode: "timestamp_ms" }),
    /** Extra context, e.g. which payees a policy_update approves. */
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("pending_intents_user_idx").on(t.userId)],
);

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

/** Small app-wide settings, e.g. the worker heartbeat. */
export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: updatedAt(),
});

/** People and places a user pays. Each must be approved with the owner's passkey (policy destinations). */
export const payees = sqliteTable(
  "payees",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** "address": any wallet on a chain. "zorro": another Zorro user (instant private transfer). */
    kind: text("kind", { enum: ["address", "zorro"] }).notNull(),
    coinKey: text("coin_key").notNull(), // what they receive by default
    chain: text("chain").notNull(), // withdraw chain, or "near-intents" for Zorro users
    address: text("address").notNull(), // canonical address, or the payee's NEAR Intents account
    handle: text("handle"), // Zorro payees: their @handle
    status: text("status", { enum: ["pending", "approving", "approved", "removed"] }).notNull().default("pending"),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("payees_user_idx").on(t.userId)],
);

export const PAYMENT_STATUSES = ["queued", "converting", "sending", "done", "failed", "review"] as const;

/**
 * The ledger: every payment out and every payment in, with what it cost in ZEC.
 * `state` holds the engine's progress (idempotency keys of each step).
 */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    direction: text("direction", { enum: ["out", "in"] }).notNull(),
    kind: text("kind", { enum: ["pay", "transfer", "request", "deposit", "autopay", "swap"] }).notNull(),
    payeeId: text("payee_id"),
    scheduleId: text("schedule_id"),
    requestId: text("request_id"),
    counterparty: text("counterparty").notNull(), // name shown in the ledger
    coinKey: text("coin_key").notNull(), // what the payee received / what came in
    amount: text("amount").notNull(), // human units of coinKey
    fundCoinKey: text("fund_coin_key").notNull(), // what left the wallet (usually zec)
    fundAmount: text("fund_amount"), // human units actually spent / received
    usdValue: real("usd_value"),
    inrValue: real("inr_value"),
    feeUsd: real("fee_usd"),
    zecUsd: real("zec_usd"), // ZEC price at the time
    reference: text("reference"), // short public id shown on receipts
    note: text("note"),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("queued"),
    state: text("state", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    error: text("error"),
    /** Claimed by whoever is advancing this payment (worker, cron or a request), so no step ever runs twice at once. */
    lockUntil: integer("lock_until", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("payments_user_idx").on(t.userId, t.createdAt), index("payments_status_idx").on(t.status)],
);

/** Autopay: a payment that repeats weekly or monthly. */
export const schedules = sqliteTable(
  "schedules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payeeId: text("payee_id")
      .notNull()
      .references(() => payees.id, { onDelete: "cascade" }),
    coinKey: text("coin_key").notNull(),
    amount: text("amount").notNull(),
    currency: text("currency", { enum: ["COIN", "USD", "INR"] }).notNull(), // amount is in this unit
    frequency: text("frequency", { enum: ["weekly", "monthly"] }).notNull(),
    day: integer("day").notNull(), // weekday 0-6 (Sun-Sat) or day of month 1-28
    note: text("note"),
    status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    warnedAt: integer("warned_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("schedules_due_idx").on(t.status, t.nextRunAt)],
);

/** Get paid: a link anyone can pay in any coin; it arrives in the wallet as ZEC. */
export const paymentRequests = sqliteTable(
  "payment_requests",
  {
    id: text("id").primaryKey(), // short public id used in the link
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    amount: text("amount").notNull(),
    currency: text("currency", { enum: ["USD", "INR", "ZEC"] }).notNull(),
    note: text("note"),
    status: text("status", { enum: ["open", "pending", "paid", "cancelled", "expired"] }).notNull().default("open"),
    payCoinKey: text("pay_coin_key"),
    payAmountUnits: text("pay_amount_units"),
    depositAddress: text("deposit_address"),
    depositMemo: text("deposit_memo"),
    depositCorrelationId: text("deposit_correlation_id"),
    depositExpiresAt: integer("deposit_expires_at", { mode: "timestamp_ms" }),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("payment_requests_user_idx").on(t.userId)],
);

/**
 * Every money action sent to the Agent API. The Idempotency-Key makes retries
 * safe: after a crash we resend with the same key instead of paying twice.
 */
export const operations = sqliteTable(
  "operations",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    paymentId: text("payment_id"),
    kind: text("kind", { enum: ["swap", "withdraw", "transfer", "deposit"] }).notNull(),
    correlationId: text("correlation_id"),
    status: text("status").notNull(), // Agent API status, or "SENDING" before a response
    request: text("request", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    response: text("response", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("operations_correlation_idx").on(t.correlationId), index("operations_agent_idx").on(t.agentId)],
);
