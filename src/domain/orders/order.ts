import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeEmail, registrationInputSchema } from "@/domain/registrations/registration";

/**
 * Checkout input. The browser picks print and size only; price, kit, seller
 * and states are always decided on the server (spec §9.2, RF-09).
 */
export function checkoutInputSchema(options: { prints: readonly string[]; sizes: readonly string[] }) {
  return z.object({
    name: registrationInputSchema.shape.name,
    email: registrationInputSchema.shape.email,
    print: z.string().refine((v) => options.prints.includes(v), "Escolha uma estampa."),
    size: z.string().refine((v) => options.sizes.includes(v), "Escolha um tamanho."),
    acceptedTerms: z.literal("on", { error: "Confirme que leu os termos de compra." }),
  });
}

export type CheckoutInput = z.infer<ReturnType<typeof checkoutInputSchema>>;

/** Same session + same hash = the same purchase intent (spec §9.3). */
export function purchaseIntentHash(input: CheckoutInput, editionSlug: string): string {
  const canonical = JSON.stringify([
    editionSlug,
    input.print,
    input.size,
    input.name,
    normalizeEmail(input.email),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export type FinancialStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "canceled"
  | "failed"
  | "disputed"
  | "requires_review";

export type ReservationStatus = "held" | "committed" | "released" | "exception";

/** The remote order as read from the provider API (never from the browser or the webhook body). */
export interface RemoteOrder {
  id: string;
  externalReference: string | null;
  /** Seller account that owns the order. */
  userId: string | null;
  applicationId: string | null;
  /** Provider status/detail, e.g. Mercado Pago Orders `processed` / `accredited`. */
  status: string;
  statusDetail: string | null;
  currency: string | null;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  hasChargeback: boolean;
}

/** What the server expects the remote order to match (spec §9.6). */
export interface Expected {
  orderId: string;
  totalCents: number;
  sellerUserId: string;
  applicationId: string | null;
}

export interface Decision {
  financial: FinancialStatus;
  reservation: ReservationStatus;
  reviewReason: string | null;
  /** Outbox topic for this transition, if any. */
  effect: "order_paid" | "order_refunded" | "order_review" | null;
}

/** Financial states that only move forward through refund/dispute/review. */
const SETTLED: ReadonlySet<FinancialStatus> = new Set([
  "paid",
  "partially_refunded",
  "refunded",
  "disputed",
  "requires_review",
]);

/**
 * Pure transition from the current local state and the remote order. Returns
 * null when nothing changes. Never releases stock on a payment signal, and
 * never moves a settled order back to unpaid/pending (spec §9.4, §9.5).
 */
export function decide(
  local: { financial: FinancialStatus; reservation: ReservationStatus },
  remote: RemoteOrder,
  expected: Expected,
): Decision | null {
  const review = (reason: string, reservation = local.reservation): Decision => ({
    financial: "requires_review",
    reservation,
    reviewReason: reason,
    effect: "order_review",
  });

  // Identity checks first: an authenticated but foreign order never pays ours.
  if (remote.externalReference !== expected.orderId) return review("reference_mismatch");
  if (remote.userId !== expected.sellerUserId) return review("seller_mismatch");
  if (expected.applicationId && remote.applicationId && remote.applicationId !== expected.applicationId)
    return review("application_mismatch");
  if (remote.currency !== "BRL" || remote.totalCents !== expected.totalCents)
    return review("amount_mismatch");

  let next: Decision | null = null;
  const commit = (): ReservationStatus => (local.reservation === "exception" ? "exception" : "committed");

  if (remote.hasChargeback) {
    next = {
      financial: "disputed",
      reservation: local.reservation,
      reviewReason: "chargeback",
      effect: "order_review",
    };
  } else if (remote.status === "processed" && remote.statusDetail === "partially_refunded") {
    next = {
      financial: "partially_refunded",
      reservation: commit(),
      reviewReason: "partial_refund",
      effect: "order_review",
    };
  } else if (remote.status === "processed") {
    if (remote.paidCents > expected.totalCents) next = review("overpaid", commit());
    else if (remote.paidCents < expected.totalCents) next = review("underpaid");
    else next = { financial: "paid", reservation: commit(), reviewReason: null, effect: "order_paid" };
  } else if (remote.status === "refunded") {
    // Restocking after a refund is a human decision (spec §9.4).
    next =
      local.reservation === "held"
        ? {
            financial: "refunded",
            reservation: "exception",
            reviewReason: "refund_on_hold",
            effect: "order_review",
          }
        : {
            financial: "refunded",
            reservation: local.reservation,
            reviewReason: null,
            effect: "order_refunded",
          };
  } else if (remote.status === "processing" || remote.status === "action_required") {
    next = { financial: "pending", reservation: local.reservation, reviewReason: null, effect: null };
  } else if (remote.status === "canceled") {
    next = {
      financial: "canceled",
      reservation: local.reservation === "held" ? "released" : local.reservation,
      reviewReason: null,
      effect: null,
    };
  } else if (remote.status === "failed") {
    // Stock stays held until the hold expires and the order is verified closed.
    next = { financial: "failed", reservation: local.reservation, reviewReason: null, effect: null };
  } else if (remote.status !== "created") {
    next = review(`unknown_status:${remote.status}`);
  }

  if (!next) return null;
  if (SETTLED.has(local.financial) && !SETTLED.has(next.financial)) return null;
  if (next.financial === local.financial && next.reservation === local.reservation) return null;
  return next;
}

/**
 * Whether an expired hold may give its unit back, given the remote order now.
 * Only a closed order with nothing able to approve it qualifies (spec §9.4).
 */
export function canRelease(remote: RemoteOrder): boolean {
  return (remote.status === "canceled" || remote.status === "failed") && remote.paidCents === 0;
}
