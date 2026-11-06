import type { RemoteOrder } from "@/domain/orders/order";
import type { CancelResult, CreateRemoteOrder, CreateResult, PaymentProvider } from "./types";

export const MOCK_SELLER_ID = "mock-seller";

/**
 * In-process provider for local work and tests (PAYMENTS_MODE=mock). Nothing
 * leaves the machine; tests drive remote state with `setRemote`.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";
  readonly orders = new Map<string, RemoteOrder>();
  private readonly byKey = new Map<string, string>();
  /** Next createOrder outcome override, for failure tests. */
  nextCreate: CreateResult | null = null;
  private seq = 0;

  async createOrder(req: CreateRemoteOrder): Promise<CreateResult> {
    if (this.nextCreate) {
      const r = this.nextCreate;
      this.nextCreate = null;
      if (r.status !== "created") return r;
    }
    const existing = this.byKey.get(req.orderId);
    if (existing)
      return { status: "created", remoteId: existing, checkoutUrl: `${req.returnUrl}?mock=${existing}` };
    this.seq += 1;
    const id = `MOCK${this.seq}`;
    this.byKey.set(req.orderId, id);
    this.orders.set(id, {
      id,
      externalReference: req.orderId,
      userId: MOCK_SELLER_ID,
      applicationId: null,
      status: "created",
      statusDetail: "created",
      currency: "BRL",
      totalCents: req.totalCents,
      paidCents: 0,
      refundedCents: 0,
      hasChargeback: false,
    });
    return { status: "created", remoteId: id, checkoutUrl: `${req.returnUrl}?mock=${id}` };
  }

  async getOrder(remoteId: string): Promise<RemoteOrder | null> {
    return this.orders.get(remoteId) ?? null;
  }

  async cancelOrder(remoteId: string): Promise<CancelResult> {
    const o = this.orders.get(remoteId);
    if (!o) return "not_found";
    if (o.status !== "created" && o.status !== "action_required") return "not_cancelable";
    this.orders.set(remoteId, { ...o, status: "canceled", statusDetail: "canceled_transaction" });
    return "canceled";
  }

  verifyNotification({ url }: { url: string }) {
    const id = new URL(url).searchParams.get("data.id");
    return id ? { topic: "order", resourceId: id } : null;
  }

  setRemote(remoteId: string, patch: Partial<RemoteOrder>): void {
    const o = this.orders.get(remoteId);
    if (o) this.orders.set(remoteId, { ...o, ...patch });
  }
}
