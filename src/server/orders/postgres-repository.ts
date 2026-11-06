import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { decide, type Expected, type RemoteOrder, type ReservationStatus } from "@/domain/orders/order";
import {
  editions,
  jobLeases,
  kits,
  orders,
  outbox,
  paymentEvidence,
  visitorSessions,
  webhookInbox,
} from "../../../db/schema";

type Tx = Parameters<Parameters<PostgresJsDatabase["transaction"]>[0]>[0];
type Db = PostgresJsDatabase | Tx;

export interface OpenOrderInput {
  sessionId: string;
  editionSlug: string;
  requestHash: string;
  print: string;
  size: string;
  buyerName: string;
  buyerEmail: string;
  provider: string;
  ttlMinutes: number;
}

export interface OpenOrder {
  id: string;
  requestHash: string;
  kitName: string;
  totalCents: number;
  buyerEmail: string;
  creationState: "pending" | "created" | "unknown" | "rejected";
  providerOrderId: string | null;
  checkoutUrl: string | null;
}

export type OpenOrderResult =
  | { status: "created"; order: OpenOrder }
  | { status: "existing"; order: OpenOrder }
  | { status: "sold_out" }
  | { status: "unavailable" };

export type ApplyResult = "applied" | "unchanged" | "unknown_order";

const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 720];
export const MAX_INBOX_ATTEMPTS = BACKOFF_MINUTES.length;

/**
 * Persistence for sessions, orders, stock, inbox and outbox. Every state change
 * that touches money or stock locks the order row and writes evidence and
 * outbox in the same transaction (spec §9.2 step 12).
 */
export class OrderStore {
  constructor(private readonly db: PostgresJsDatabase) {}

  // --- Sessions ------------------------------------------------------------

  async findSession(tokenHash: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: visitorSessions.id })
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.tokenHash, tokenHash),
          isNull(visitorSessions.revokedAt),
          sql`${visitorSessions.expiresAt} > now()`,
        ),
      );
    return row?.id ?? null;
  }

  async createSession(tokenHash: string, expiresAt: Date): Promise<string> {
    const [row] = await this.db
      .insert(visitorSessions)
      .values({ tokenHash, expiresAt })
      .returning({ id: visitorSessions.id });
    return row.id;
  }

  // --- Checkout --------------------------------------------------------------

  /**
   * Returns the session's open order, or reserves one unit and creates a new
   * one. The partial unique index makes double clicks and parallel tabs
   * converge on a single order.
   */
  async openOrder(input: OpenOrderInput): Promise<OpenOrderResult> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.db.transaction(async (tx) => {
          const existing = await heldOrderForSession(tx, input.sessionId);
          if (existing) return { status: "existing", order: existing } as const;

          const [kit] = await tx
            .select({ id: kits.id, editionId: kits.editionId, name: kits.name, priceCents: kits.priceCents })
            .from(kits)
            .innerJoin(editions, eq(editions.id, kits.editionId))
            .where(and(eq(editions.slug, input.editionSlug), eq(kits.active, true)))
            .limit(1);
          if (!kit) return { status: "unavailable" } as const;

          // Conditional increment: never oversells under concurrency.
          const reserved = await tx
            .update(kits)
            .set({ stockReserved: sql`${kits.stockReserved} + 1` })
            .where(
              and(eq(kits.id, kit.id), sql`${kits.stockReserved} + ${kits.stockSold} < ${kits.stockTotal}`),
            )
            .returning({ id: kits.id });
          if (reserved.length === 0) return { status: "sold_out" } as const;

          const [row] = await tx
            .insert(orders)
            .values({
              editionId: kit.editionId,
              kitId: kit.id,
              sessionId: input.sessionId,
              requestHash: input.requestHash,
              print: input.print,
              size: input.size,
              buyerName: input.buyerName,
              buyerEmail: input.buyerEmail,
              totalCents: kit.priceCents,
              provider: input.provider,
              expiresAt: sql`now() + make_interval(mins => ${input.ttlMinutes})`,
            })
            .returning({ id: orders.id });
          return {
            status: "created",
            order: {
              id: row.id,
              requestHash: input.requestHash,
              kitName: kit.name,
              totalCents: kit.priceCents,
              buyerEmail: input.buyerEmail,
              creationState: "pending",
              providerOrderId: null,
              checkoutUrl: null,
            },
          } as const;
        });
      } catch (error) {
        // Lost the race to another tab/click: read its order on the next pass.
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new Error("open_order_conflict");
  }

  async heldOrderForSession(sessionId: string): Promise<OpenOrder | null> {
    return heldOrderForSession(this.db, sessionId);
  }

  async markCreated(orderId: string, remoteId: string, checkoutUrl: string): Promise<void> {
    await this.db
      .update(orders)
      .set({ creationState: "created", providerOrderId: remoteId, checkoutUrl, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  async markCreationUnknown(orderId: string): Promise<void> {
    await this.db
      .update(orders)
      .set({ creationState: "unknown", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.creationState, "pending")));
  }

  /** The provider refused the creation, so nothing remote can be paid: give the unit back. */
  async releaseRejected(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (!order || order.reservationStatus !== "held" || order.providerOrderId) return;
      await tx
        .update(orders)
        .set({
          creationState: "rejected",
          financialStatus: "failed",
          reservationStatus: "released",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));
      await moveStock(tx, order.kitId, "held", "released");
    });
  }

  // --- Remote state ------------------------------------------------------------

  async orderIdForRemote(remoteId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.providerOrderId, remoteId));
    return row?.id ?? null;
  }

  /** Attaches a remote order found later (lost creation answer) to our order. */
  async attachRemote(orderId: string, remoteId: string): Promise<void> {
    await this.db
      .update(orders)
      .set({ providerOrderId: remoteId, creationState: "created", updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), isNull(orders.providerOrderId)));
  }

  /**
   * Applies the remote order to ours in one transaction: financial and
   * reservation state, stock, evidence and outbox.
   */
  async applyRemote(
    orderId: string,
    remote: RemoteOrder,
    sellerUserId: string,
    applicationId: string | null,
  ) {
    return this.db.transaction(async (tx): Promise<ApplyResult> => {
      const order = await lockOrder(tx, orderId);
      if (!order) return "unknown_order";
      const expected: Expected = {
        orderId: order.id,
        totalCents: order.totalCents,
        sellerUserId,
        applicationId,
      };
      const next = decide(
        { financial: order.financialStatus, reservation: order.reservationStatus },
        remote,
        expected,
      );

      // Remote snapshot is kept even when the projection does not change.
      const base = {
        remoteStatus: remote.status,
        remoteStatusDetail: remote.statusDetail,
        paidCents: Number.isFinite(remote.paidCents) ? remote.paidCents : 0,
        updatedAt: new Date(),
      };
      if (!next) {
        await tx.update(orders).set(base).where(eq(orders.id, order.id));
        return "unchanged";
      }

      let reservation = next.reservation;
      let reviewReason = next.reviewReason;
      if (reservation !== order.reservationStatus) {
        const ok = await moveStock(tx, order.kitId, order.reservationStatus, reservation);
        if (!ok) {
          // Paid after its unit was released and none is left (spec §9.4).
          reservation = "exception";
          reviewReason = "paid_without_stock";
        }
      }

      await tx
        .update(orders)
        .set({
          ...base,
          financialStatus: reviewReason === "paid_without_stock" ? "requires_review" : next.financial,
          reservationStatus: reservation,
          reviewReason: reviewReason ?? order.reviewReason,
          ...(next.financial === "paid" && !order.paidAt ? { paidAt: new Date() } : {}),
        })
        .where(eq(orders.id, order.id));
      await tx.insert(paymentEvidence).values({
        orderId: order.id,
        remoteStatus: remote.status,
        remoteStatusDetail: remote.statusDetail,
        paidCents: base.paidCents,
        refundedCents: Number.isFinite(remote.refundedCents) ? remote.refundedCents : 0,
        financialStatus: next.financial,
        reservationStatus: reservation,
      });
      const effect = reviewReason === "paid_without_stock" ? "order_review" : next.effect;
      if (effect) {
        await tx
          .insert(outbox)
          .values({
            dedupeKey: `${order.id}:${effect}:${next.financial}:${reviewReason ?? ""}`,
            topic: effect,
            orderId: order.id,
            payload: { orderId: order.id, financial: next.financial, reviewReason },
          })
          .onConflictDoNothing({ target: outbox.dedupeKey });
      }
      return "applied";
    });
  }

  // --- Inbox -------------------------------------------------------------------

  /** Durable before acknowledging (spec §10.1.6). A new notice re-arms the row. */
  async recordNotification(provider: string, topic: string, resourceId: string): Promise<string> {
    const [row] = await this.db
      .insert(webhookInbox)
      .values({ provider, topic, resourceId })
      .onConflictDoUpdate({
        target: [webhookInbox.provider, webhookInbox.topic, webhookInbox.resourceId],
        set: {
          receivedAt: sql`now()`,
          processedAt: null,
          attempts: 0,
          nextAttemptAt: sql`now()`,
          lastError: null,
        },
      })
      .returning({ id: webhookInbox.id });
    return row.id;
  }

  async pendingInbox(limit: number) {
    return this.db
      .select({ id: webhookInbox.id, resourceId: webhookInbox.resourceId, attempts: webhookInbox.attempts })
      .from(webhookInbox)
      .where(
        and(
          isNull(webhookInbox.processedAt),
          lte(webhookInbox.nextAttemptAt, sql`now()`),
          sql`${webhookInbox.attempts} < ${MAX_INBOX_ATTEMPTS}`,
        ),
      )
      .orderBy(asc(webhookInbox.nextAttemptAt))
      .limit(limit);
  }

  async inboxDone(id: string, note: string | null = null): Promise<void> {
    await this.db
      .update(webhookInbox)
      .set({ processedAt: sql`now()`, lastError: note })
      .where(eq(webhookInbox.id, id));
  }

  /** Finite retries with growing backoff; the last failure stays visible (spec §10.2). */
  async inboxFailed(id: string, attempts: number, error: string): Promise<void> {
    const minutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length - 1)];
    await this.db
      .update(webhookInbox)
      .set({
        attempts: attempts + 1,
        lastError: error.slice(0, 200),
        nextAttemptAt: sql`now() + make_interval(mins => ${minutes})`,
      })
      .where(eq(webhookInbox.id, id));
  }

  // --- Reconciliation ----------------------------------------------------------

  /** Holds past their expiry plus a grace period, oldest first. */
  async expiredHolds(graceMinutes: number, limit: number) {
    return this.db
      .select({ id: orders.id, providerOrderId: orders.providerOrderId, creationState: orders.creationState })
      .from(orders)
      .where(
        and(
          eq(orders.reservationStatus, "held"),
          sql`${orders.expiresAt} + make_interval(mins => ${graceMinutes}) <= now()`,
        ),
      )
      .orderBy(asc(orders.expiresAt))
      .limit(limit);
  }

  /** Gives an expired hold's unit back. Callers verify the remote order is closed first. */
  async releaseVerified(orderId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (!order || order.reservationStatus !== "held") return;
      await tx
        .update(orders)
        .set({ reservationStatus: "released", updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await moveStock(tx, order.kitId, "held", "released");
    });
  }

  async unknownCreations(limit: number) {
    return this.db
      .select({
        id: orders.id,
        totalCents: orders.totalCents,
        buyerEmail: orders.buyerEmail,
        size: orders.size,
        kitName: kits.name,
      })
      .from(orders)
      .innerJoin(kits, eq(kits.id, orders.kitId))
      .where(and(eq(orders.creationState, "unknown"), eq(orders.reservationStatus, "held")))
      .limit(limit);
  }

  /** Keeps the unit held and flags a person when the remote state cannot be verified. */
  async flagHold(orderId: string, reason: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (!order || order.reservationStatus !== "held" || order.reviewReason === reason) return;
      await tx
        .update(orders)
        .set({ financialStatus: "requires_review", reviewReason: reason, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await tx
        .insert(outbox)
        .values({
          dedupeKey: `${orderId}:order_review:${reason}`,
          topic: "order_review",
          orderId,
          payload: { orderId, reviewReason: reason },
        })
        .onConflictDoNothing({ target: outbox.dedupeKey });
    });
  }

  async cleanupRateLimits(): Promise<void> {
    await this.db.execute(sql`delete from rate_limit_buckets where reset_at < now() - interval '1 day'`);
  }

  // --- Lease -------------------------------------------------------------------

  async acquireLease(name: string, holder: string, seconds: number): Promise<boolean> {
    const rows = await this.db.execute(sql`
      insert into job_leases (name, holder, expires_at)
      values (${name}, ${holder}, now() + make_interval(secs => ${seconds}))
      on conflict (name) do update set holder = excluded.holder, expires_at = excluded.expires_at
      where job_leases.expires_at < now()
      returning name
    `);
    return rows.length > 0;
  }

  async releaseLease(name: string, holder: string): Promise<void> {
    await this.db.delete(jobLeases).where(and(eq(jobLeases.name, name), eq(jobLeases.holder, holder)));
  }
}

async function heldOrderForSession(db: Db, sessionId: string): Promise<OpenOrder | null> {
  const [row] = await db
    .select({
      id: orders.id,
      requestHash: orders.requestHash,
      kitName: kits.name,
      totalCents: orders.totalCents,
      buyerEmail: orders.buyerEmail,
      creationState: orders.creationState,
      providerOrderId: orders.providerOrderId,
      checkoutUrl: orders.checkoutUrl,
    })
    .from(orders)
    .innerJoin(kits, eq(kits.id, orders.kitId))
    .where(and(eq(orders.sessionId, sessionId), eq(orders.reservationStatus, "held")));
  return row ?? null;
}

async function lockOrder(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      id: orders.id,
      kitId: orders.kitId,
      totalCents: orders.totalCents,
      financialStatus: orders.financialStatus,
      reservationStatus: orders.reservationStatus,
      providerOrderId: orders.providerOrderId,
      reviewReason: orders.reviewReason,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .where(eq(orders.id, id))
    .for("update");
  return row;
}

/** Applies a reservation transition to the kit counters. False when no unit is available. */
async function moveStock(
  tx: Tx,
  kitId: string,
  from: ReservationStatus,
  to: ReservationStatus,
): Promise<boolean> {
  if (from === "held" && to === "committed") {
    await tx
      .update(kits)
      .set({ stockReserved: sql`${kits.stockReserved} - 1`, stockSold: sql`${kits.stockSold} + 1` })
      .where(eq(kits.id, kitId));
  } else if (from === "held" && to === "released") {
    await tx
      .update(kits)
      .set({ stockReserved: sql`${kits.stockReserved} - 1` })
      .where(eq(kits.id, kitId));
  } else if (from === "released" && to === "committed") {
    const rows = await tx
      .update(kits)
      .set({ stockSold: sql`${kits.stockSold} + 1` })
      .where(and(eq(kits.id, kitId), sql`${kits.stockReserved} + ${kits.stockSold} < ${kits.stockTotal}`))
      .returning({ id: kits.id });
    return rows.length > 0;
  }
  // held -> exception keeps the unit reserved until a person decides.
  return true;
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}
