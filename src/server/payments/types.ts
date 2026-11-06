import type { RemoteOrder } from "@/domain/orders/order";

export interface CreateRemoteOrder {
  /** Our order id: external reference and remote idempotency key (stable per attempt). */
  orderId: string;
  title: string;
  totalCents: number;
  buyerEmail: string;
  /** Minutes the remote checkout stays payable. */
  ttlMinutes: number;
  /** Absolute URLs. The return page only says "we are confirming"; it never confirms. */
  returnUrl: string;
}

export type CreateResult =
  | { status: "created"; remoteId: string; checkoutUrl: string }
  /** The provider refused the request: no remote order exists. */
  | { status: "rejected"; reason: string }
  /** Timeout, network or server error: the order may or may not exist remotely. */
  | { status: "unknown"; reason: string };

export type CancelResult = "canceled" | "not_cancelable" | "not_found" | "error";

export interface PaymentProvider {
  readonly name: string;
  createOrder(req: CreateRemoteOrder): Promise<CreateResult>;
  /** Source of truth: the order as the provider API reports it now. Null when it does not exist. */
  getOrder(remoteId: string): Promise<RemoteOrder | null>;
  cancelOrder(remoteId: string, idempotencyKey: string): Promise<CancelResult>;
  /**
   * Authenticates a notification and returns the resource it refers to, or
   * null when the request is not genuine or not about an order.
   */
  verifyNotification(req: {
    url: string;
    headers: Headers;
    body: string;
  }): { topic: string; resourceId: string } | null;
}
