import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Phase 1 schema. Prepared for several editions (spec RF-31) without building that UI.
 * Orders, payments, inbox/outbox and audit tables arrive with the kit checkout (Phase 3).
 */

export const editions = pgTable("editions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  timeZone: text("time_zone").notNull().default("America/Belem"),
  registrationOpen: boolean("registration_open").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** HMAC-SHA256 of the normalized e-mail; dedupe key that does not expose the address. */
    emailHash: text("email_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Set when anonymized under the retention policy (RF-27). */
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("registrations_edition_email_hash_uq").on(t.editionId, t.emailHash),
    check("registrations_name_len", sql`char_length(${t.name}) between 1 and 80`),
  ],
);

export const kits = pgTable(
  "kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    /** BRL cents. Price is always recomputed on the server (RF-09). */
    priceCents: integer("price_cents").notNull(),
    stockTotal: integer("stock_total").notNull(),
    stockReserved: integer("stock_reserved").notNull().default(0),
    stockSold: integer("stock_sold").notNull().default(0),
    active: boolean("active").notNull().default(false),
  },
  (t) => [
    uniqueIndex("kits_edition_sku_uq").on(t.editionId, t.sku),
    check("kits_price_positive", sql`${t.priceCents} > 0`),
    check(
      "kits_stock_consistent",
      sql`${t.stockReserved} >= 0 and ${t.stockSold} >= 0 and ${t.stockReserved} + ${t.stockSold} <= ${t.stockTotal}`,
    ),
  ],
);

export const goalMilestones = pgTable(
  "goal_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    kitsTarget: integer("kits_target").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
  },
  (t) => [
    uniqueIndex("goal_milestones_edition_target_uq").on(t.editionId, t.kitsTarget),
    check("goal_milestones_target_positive", sql`${t.kitsTarget} > 0`),
  ],
);

/**
 * Fixed-window counters shared by every server instance (spec §12).
 * Keys are HMACs, never raw IPs or e-mails.
 */
export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/**
 * Anonymous visitor session (security-requirements §2). The browser keeps an
 * opaque random token in an HttpOnly cookie; only its SHA-256 is stored.
 */
export const visitorSessions = pgTable("visitor_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const FINANCIAL_STATUSES = [
  "unpaid",
  "pending",
  "paid",
  "partially_refunded",
  "refunded",
  "canceled",
  "failed",
  "disputed",
  "requires_review",
] as const;
export const RESERVATION_STATUSES = ["held", "committed", "released", "exception"] as const;
export const CREATION_STATES = ["pending", "created", "unknown", "rejected"] as const;

/**
 * Kit orders (spec §9). Price, kit and states are decided only by the server.
 * Financial and reservation states are separate projections (spec §9.5).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    editionId: uuid("edition_id")
      .notNull()
      .references(() => editions.id, { onDelete: "restrict" }),
    kitId: uuid("kit_id")
      .notNull()
      .references(() => kits.id, { onDelete: "restrict" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => visitorSessions.id, { onDelete: "restrict" }),
    /** SHA-256 of the normalized purchase intent; same session + same hash = same order. */
    requestHash: text("request_hash").notNull(),
    print: text("print").notNull(),
    size: text("size").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    /** BRL cents, frozen from the kit when the order is created. */
    totalCents: integer("total_cents").notNull(),
    financialStatus: text("financial_status", { enum: FINANCIAL_STATUSES }).notNull().default("unpaid"),
    reservationStatus: text("reservation_status", { enum: RESERVATION_STATUSES }).notNull().default("held"),
    provider: text("provider").notNull(),
    /** Remote creation outcome; "unknown" means a lost answer that must be recovered, never re-created. */
    creationState: text("creation_state", { enum: CREATION_STATES }).notNull().default("pending"),
    providerOrderId: text("provider_order_id").unique(),
    checkoutUrl: text("checkout_url"),
    remoteStatus: text("remote_status"),
    remoteStatusDetail: text("remote_status_detail"),
    paidCents: integer("paid_cents").notNull().default(0),
    reviewReason: text("review_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("orders_total_positive", sql`${t.totalCents} > 0`),
    check("orders_buyer_name_len", sql`char_length(${t.buyerName}) between 1 and 80`),
    // One open purchase per session: a double click or a second tab resumes it.
    uniqueIndex("orders_one_held_per_session_uq")
      .on(t.sessionId)
      .where(sql`${t.reservationStatus} = 'held'`),
    index("orders_held_expiry_idx")
      .on(t.expiresAt)
      .where(sql`${t.reservationStatus} = 'held'`),
  ],
);

/**
 * Durable inbox of authenticated provider notifications (spec §10.1). One row
 * per remote resource: a new notification re-arms it, and processing always
 * re-reads the resource from the provider API.
 */
export const webhookInbox = pgTable(
  "webhook_inbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    topic: text("topic").notNull(),
    resourceId: text("resource_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("webhook_inbox_resource_uq").on(t.provider, t.topic, t.resourceId),
    index("webhook_inbox_pending_idx")
      .on(t.nextAttemptAt)
      .where(sql`${t.processedAt} is null`),
  ],
);

/** Remote state used for each transition, kept as evidence (spec §9.5). */
export const paymentEvidence = pgTable("payment_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "restrict" }),
  remoteStatus: text("remote_status").notNull(),
  remoteStatusDetail: text("remote_status_detail"),
  paidCents: integer("paid_cents").notNull(),
  refundedCents: integer("refunded_cents").notNull(),
  financialStatus: text("financial_status").notNull(),
  reservationStatus: text("reservation_status").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Side effects (e-mails, alerts) written in the same transaction as the state
 * change; a unique key per order transition keeps them single (spec §10.2).
 */
export const outbox = pgTable(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    topic: text("topic").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    index("outbox_unsent_idx")
      .on(t.createdAt)
      .where(sql`${t.sentAt} is null`),
  ],
);

/** Lease so only one scheduled job runs at a time (spec §10.2). */
export const jobLeases = pgTable("job_leases", {
  name: text("name").primaryKey(),
  holder: text("holder").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
