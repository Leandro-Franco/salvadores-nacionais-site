import { canRelease, purchaseIntentHash, type CheckoutInput } from "@/domain/orders/order";
import type { PaymentProvider } from "@/server/payments/types";
import type { OpenOrder, OrderStore } from "./postgres-repository";

export interface Deps {
  store: OrderStore;
  provider: PaymentProvider;
  baseUrl: string;
  ttlMinutes: number;
  sellerUserId: string;
  applicationId: string | null;
}

export type StartCheckoutResult =
  | { status: "redirect"; url: string }
  /** The session already has an open order for a different choice. */
  | { status: "other_open_order"; url: string | null }
  /** Remote creation still unresolved: never create a second charge (spec §9.3). */
  | { status: "in_progress" }
  | { status: "sold_out" }
  | { status: "unavailable" };

/**
 * Opens (or resumes) the session's order and returns where to send the buyer.
 * The stock hold commits before the network call; no SQL transaction stays
 * open while the provider is called (spec §9.2 steps 6–8).
 */
export async function startCheckout(
  input: CheckoutInput,
  editionSlug: string,
  sessionId: string,
  deps: Deps,
): Promise<StartCheckoutResult> {
  const requestHash = purchaseIntentHash(input, editionSlug);
  const opened = await deps.store.openOrder({
    sessionId,
    editionSlug,
    requestHash,
    print: input.print,
    size: input.size,
    buyerName: input.name,
    buyerEmail: input.email,
    provider: deps.provider.name,
    ttlMinutes: deps.ttlMinutes,
  });
  if (opened.status === "sold_out" || opened.status === "unavailable") return opened;

  const order = opened.order;
  if (opened.status === "existing" && order.requestHash !== requestHash)
    return { status: "other_open_order", url: order.checkoutUrl };
  if (order.creationState === "created" && order.checkoutUrl)
    return { status: "redirect", url: order.checkoutUrl };
  // A new order, or a previous attempt whose answer was lost: the same
  // idempotency key (our order id) can only return the same remote order.
  if (order.creationState === "pending" || order.creationState === "unknown")
    return createRemote(order, input.size, deps);
  return { status: "in_progress" };
}

async function createRemote(order: OpenOrder, size: string, deps: Deps): Promise<StartCheckoutResult> {
  const result = await deps.provider.createOrder({
    orderId: order.id,
    title: `${order.kitName} (${size})`,
    totalCents: order.totalCents,
    buyerEmail: order.buyerEmail,
    ttlMinutes: deps.ttlMinutes,
    returnUrl: `${deps.baseUrl}/kit/obrigado`,
  });
  if (result.status === "created") {
    await deps.store.markCreated(order.id, result.remoteId, result.checkoutUrl);
    return { status: "redirect", url: result.checkoutUrl };
  }
  if (result.status === "rejected") {
    console.error("checkout_rejected", { reason: result.reason });
    await deps.store.releaseRejected(order.id);
    return { status: "unavailable" };
  }
  console.error("checkout_creation_unknown", { reason: result.reason });
  await deps.store.markCreationUnknown(order.id);
  return { status: "in_progress" };
}

/** The buyer gives up an open order: cancel remotely first, release only once verified. */
export async function cancelOpenOrder(
  sessionId: string,
  deps: Deps,
): Promise<"canceled" | "not_canceled" | "none"> {
  const order = await deps.store.heldOrderForSession(sessionId);
  if (!order) return "none";
  if (!order.providerOrderId) {
    if (order.creationState === "pending" || order.creationState === "unknown") return "not_canceled";
    return "none";
  }
  await deps.provider.cancelOrder(order.providerOrderId, `cancel-${order.id}`);
  const remote = await deps.provider.getOrder(order.providerOrderId);
  if (!remote) return "not_canceled";
  await deps.store.applyRemote(order.id, remote, deps.sellerUserId, deps.applicationId);
  return remote.status === "canceled" ? "canceled" : "not_canceled";
}

export type NotificationResult = { httpStatus: number; outcome: "accepted" | "processed" | "rejected" };

/**
 * Authenticates, persists to the inbox and only then acknowledges (spec
 * §10.1). Processing is attempted right away when it fits; failures stay in
 * the inbox for the scheduled job.
 */
export async function handleNotification(
  req: { url: string; headers: Headers; body: string },
  deps: Deps,
): Promise<NotificationResult> {
  const verified = deps.provider.verifyNotification(req);
  if (!verified) return { httpStatus: 401, outcome: "rejected" };

  const inboxId = await deps.store.recordNotification(
    deps.provider.name,
    verified.topic,
    verified.resourceId,
  );
  try {
    await processResource(inboxId, verified.resourceId, 0, deps);
    return { httpStatus: 200, outcome: "processed" };
  } catch (error) {
    await deps.store.inboxFailed(inboxId, 0, error instanceof Error ? error.message : "unknown");
    return { httpStatus: 200, outcome: "accepted" };
  }
}

/** Re-reads the remote order and applies it. Throws on transient failures (retried later). */
export async function processResource(inboxId: string, remoteId: string, attempts: number, deps: Deps) {
  const remote = await deps.provider.getOrder(remoteId);
  if (!remote) {
    await deps.store.inboxDone(inboxId, "remote_not_found");
    return;
  }
  let orderId = await deps.store.orderIdForRemote(remoteId);
  if (!orderId && remote.externalReference && remote.userId === deps.sellerUserId) {
    // Our creation answer was lost; the remote order points back to us.
    await deps.store.attachRemote(remote.externalReference, remote.id).catch(() => undefined);
    orderId = await deps.store.orderIdForRemote(remoteId);
  }
  if (!orderId) {
    // Authenticated but not ours: keep it visible for review, never apply it.
    console.error("payment_notification_unmatched", { attempts });
    await deps.store.inboxDone(inboxId, "unmatched_order");
    return;
  }
  await deps.store.applyRemote(orderId, remote, deps.sellerUserId, deps.applicationId);
  await deps.store.inboxDone(inboxId);
}

export interface ReconcileReport {
  inbox: number;
  recovered: number;
  released: number;
  flagged: number;
  errors: number;
}

/**
 * Scheduled reconciliation (spec §10.3): small batches under a lease, so two
 * runs never work at once. Recovers missed notifications without a site visit.
 */
export async function reconcile(deps: Deps, opts: { holder: string; graceMinutes?: number; batch?: number }) {
  const report: ReconcileReport = { inbox: 0, recovered: 0, released: 0, flagged: 0, errors: 0 };
  const batch = opts.batch ?? 20;
  if (!(await deps.store.acquireLease("reconcile", opts.holder, 240))) return null;
  try {
    for (const item of await deps.store.pendingInbox(batch)) {
      try {
        await processResource(item.id, item.resourceId, item.attempts, deps);
        report.inbox += 1;
      } catch (error) {
        report.errors += 1;
        await deps.store.inboxFailed(
          item.id,
          item.attempts,
          error instanceof Error ? error.message : "unknown",
        );
      }
    }

    // Lost creation answers: retry with the same idempotency key.
    for (const o of await deps.store.unknownCreations(batch)) {
      const result = await deps.provider.createOrder({
        orderId: o.id,
        title: `${o.kitName} (${o.size})`,
        totalCents: o.totalCents,
        buyerEmail: o.buyerEmail,
        ttlMinutes: deps.ttlMinutes,
        returnUrl: `${deps.baseUrl}/kit/obrigado`,
      });
      if (result.status === "created") {
        await deps.store.markCreated(o.id, result.remoteId, result.checkoutUrl);
        report.recovered += 1;
      }
    }

    // Expired holds give their unit back only after the remote order is
    // verifiably closed (spec §9.4).
    for (const o of await deps.store.expiredHolds(opts.graceMinutes ?? 15, batch)) {
      try {
        if (!o.providerOrderId) {
          if (o.creationState === "unknown" || o.creationState === "pending") {
            await deps.store.flagHold(o.id, "creation_unknown");
            report.flagged += 1;
          }
          continue;
        }
        let remote = await deps.provider.getOrder(o.providerOrderId);
        if (remote && (remote.status === "created" || remote.status === "action_required")) {
          await deps.provider.cancelOrder(o.providerOrderId, `expire-${o.id}`);
          remote = await deps.provider.getOrder(o.providerOrderId);
        }
        if (!remote) {
          await deps.store.flagHold(o.id, "remote_not_found");
          report.flagged += 1;
          continue;
        }
        await deps.store.applyRemote(o.id, remote, deps.sellerUserId, deps.applicationId);
        if (canRelease(remote)) {
          await deps.store.releaseVerified(o.id);
          report.released += 1;
        } else if (remote.status === "processing") {
          await deps.store.flagHold(o.id, "processing_after_expiry");
          report.flagged += 1;
        }
      } catch {
        report.errors += 1;
      }
    }

    await deps.store.cleanupRateLimits();
    return report;
  } finally {
    await deps.store.releaseLease("reconcile", opts.holder);
  }
}
