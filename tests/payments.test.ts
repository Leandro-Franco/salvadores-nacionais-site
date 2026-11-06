import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canRelease,
  checkoutInputSchema,
  decide,
  purchaseIntentHash,
  type RemoteOrder,
} from "@/domain/orders/order";
import {
  decimalToCents,
  isAllowedCheckoutUrl,
  MercadoPagoOrdersProvider,
  parseOrder,
} from "@/server/payments/mercadopago";

const input = {
  name: "Ana",
  email: "ana@example.com",
  print: "logo",
  size: "M",
  acceptedTerms: "on" as const,
};

describe("checkout input", () => {
  const schema = checkoutInputSchema({ prints: ["logo", "estrela"], sizes: ["P", "M"] });
  it("accepts known print and size only", () => {
    expect(schema.safeParse(input).success).toBe(true);
    expect(schema.safeParse({ ...input, size: "XXXL" }).success).toBe(false);
    expect(schema.safeParse({ ...input, print: "other" }).success).toBe(false);
    expect(schema.safeParse({ ...input, acceptedTerms: undefined }).success).toBe(false);
  });
  it("drops any price, seller or quantity sent by the browser", () => {
    const r = schema.safeParse({ ...input, priceCents: 1, seller: "x", quantity: 9 });
    expect(r.success && Object.keys(r.data).sort()).toEqual([
      "acceptedTerms",
      "email",
      "name",
      "print",
      "size",
    ]);
  });
  it("hashes the same intent the same way, ignoring e-mail case", () => {
    const a = purchaseIntentHash(input, "belem-2026");
    expect(purchaseIntentHash({ ...input, email: "ANA@example.com" }, "belem-2026")).toBe(a);
    expect(purchaseIntentHash({ ...input, size: "P" }, "belem-2026")).not.toBe(a);
  });
});

describe("order decisions", () => {
  const expected = { orderId: "o1", totalCents: 9000, sellerUserId: "42", applicationId: "7" };
  const remote = (patch: Partial<RemoteOrder> = {}): RemoteOrder => ({
    id: "ORD1",
    externalReference: "o1",
    userId: "42",
    applicationId: "7",
    status: "processed",
    statusDetail: "accredited",
    currency: "BRL",
    totalCents: 9000,
    paidCents: 9000,
    refundedCents: 0,
    hasChargeback: false,
    ...patch,
  });
  const open = { financial: "unpaid" as const, reservation: "held" as const };

  it("pays and commits stock only when everything matches", () => {
    expect(decide(open, remote(), expected)).toMatchObject({
      financial: "paid",
      reservation: "committed",
      effect: "order_paid",
    });
  });

  it("sends foreign, mismatched or odd payments to review without releasing stock", () => {
    for (const [patch, reason] of [
      [{ externalReference: "other" }, "reference_mismatch"],
      [{ userId: "99" }, "seller_mismatch"],
      [{ applicationId: "8" }, "application_mismatch"],
      [{ currency: "USD" }, "amount_mismatch"],
      [{ totalCents: 100 }, "amount_mismatch"],
      [{ paidCents: 100 }, "underpaid"],
      [{ status: "weird" }, "unknown_status:weird"],
    ] as const) {
      expect(decide(open, remote(patch), expected)).toMatchObject({
        financial: "requires_review",
        reservation: "held",
        reviewReason: reason,
      });
    }
    expect(decide(open, remote({ paidCents: 18000 }), expected)).toMatchObject({
      financial: "requires_review",
      reservation: "committed",
      reviewReason: "overpaid",
    });
  });

  it("never moves a paid order back, but follows refunds and disputes", () => {
    const paid = { financial: "paid" as const, reservation: "committed" as const };
    expect(decide(paid, remote({ status: "processing", paidCents: 0 }), expected)).toBeNull();
    expect(decide(paid, remote({ status: "canceled", paidCents: 0 }), expected)).toBeNull();
    expect(decide(paid, remote({ status: "refunded" }), expected)).toMatchObject({
      financial: "refunded",
      reservation: "committed",
      effect: "order_refunded",
    });
    expect(decide(paid, remote({ statusDetail: "partially_refunded" }), expected)?.financial).toBe(
      "partially_refunded",
    );
    expect(decide(paid, remote({ hasChargeback: true }), expected)?.financial).toBe("disputed");
  });

  it("releases only on cancel; failed and pending keep the hold", () => {
    expect(decide(open, remote({ status: "canceled", paidCents: 0 }), expected)?.reservation).toBe(
      "released",
    );
    expect(decide(open, remote({ status: "failed", paidCents: 0 }), expected)).toMatchObject({
      financial: "failed",
      reservation: "held",
    });
    expect(decide(open, remote({ status: "processing", paidCents: 0 }), expected)?.reservation).toBe("held");
    expect(decide(open, remote({ status: "created", paidCents: 0 }), expected)).toBeNull();
    expect(canRelease(remote({ status: "canceled", paidCents: 0 }))).toBe(true);
    expect(canRelease(remote({ status: "processing", paidCents: 0 }))).toBe(false);
    expect(canRelease(remote({ status: "canceled", paidCents: 100 }))).toBe(false);
  });
});

describe("mercado pago orders", () => {
  const secret = "test-webhook-secret";
  const mp = new MercadoPagoOrdersProvider({ accessToken: "APP_USR-x", webhookSecret: secret });
  const url = "https://example.test/api/webhooks/payments?data.id=ORD01ABC&type=order";
  const sign = (manifest: string) => {
    const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
    return new Headers({ "x-signature": `ts=1742505638683,v1=${v1}`, "x-request-id": "req-1" });
  };

  it("accepts the SDK manifest, raw or lowercased id", () => {
    const raw = sign("id:ORD01ABC;request-id:req-1;ts:1742505638683;");
    const lower = sign("id:ord01abc;request-id:req-1;ts:1742505638683;");
    expect(mp.verifyNotification({ url, headers: raw, body: "" })).toEqual({
      topic: "order",
      resourceId: "ORD01ABC",
    });
    expect(mp.verifyNotification({ url, headers: lower, body: "" })?.resourceId).toBe("ORD01ABC");
  });

  it("rejects a wrong secret, another id, another topic or no signature", () => {
    const headers = sign("id:ORD01ABC;request-id:req-1;ts:1742505638683;");
    const other = new MercadoPagoOrdersProvider({ accessToken: "x", webhookSecret: "other" });
    expect(other.verifyNotification({ url, headers, body: "" })).toBeNull();
    expect(mp.verifyNotification({ url: url.replace("ORD01ABC", "ORD01ABD"), headers, body: "" })).toBeNull();
    expect(
      mp.verifyNotification({ url: url.replace("type=order", "type=payment"), headers, body: "" }),
    ).toBeNull();
    expect(mp.verifyNotification({ url, headers: new Headers(), body: "" })).toBeNull();
    expect(mp.verifyNotification({ url: url.replace("ORD01ABC", "..%2Fx"), headers, body: "" })).toBeNull();
  });

  it("parses money as strings and reads seller, refunds and chargebacks", () => {
    expect([
      decimalToCents("90.00"),
      decimalToCents("90"),
      decimalToCents("0.5"),
      decimalToCents("1e3"),
    ]).toEqual([9000, 9000, 50, NaN]);
    const o = parseOrder({
      id: "ORD1",
      external_reference: "o1",
      user_id: 42,
      integration_data: { application_id: "7" },
      status: "processed",
      status_detail: "partially_refunded",
      currency: "BRL",
      total_amount: "90.00",
      total_paid_amount: "90.00",
      transactions: { refunds: [{ amount: "10.00", status: "processed" }], chargebacks: [{ id: "c" }] },
    });
    expect(o).toMatchObject({
      userId: "42",
      applicationId: "7",
      paidCents: 9000,
      refundedCents: 1000,
      hasChargeback: true,
    });
  });

  it("only redirects to exact Mercado Pago hosts over https", () => {
    expect(isAllowedCheckoutUrl("https://www.mercadopago.com.br/checkout/v1/redirect?order_id=X")).toBe(true);
    expect(isAllowedCheckoutUrl("http://www.mercadopago.com.br/x")).toBe(false);
    expect(isAllowedCheckoutUrl("https://www.mercadopago.com.br.evil.test/x")).toBe(false);
    expect(isAllowedCheckoutUrl("https://evil.test/?u=www.mercadopago.com.br")).toBe(false);
  });

  it("creates with a stable idempotency key and classifies failures", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    let next = () =>
      Response.json(
        {
          id: "ORD1",
          status: "created",
          checkout_url: "https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORD1",
        },
        { status: 201 },
      );
    const p = new MercadoPagoOrdersProvider({
      accessToken: "APP_USR-x",
      webhookSecret: secret,
      fetch: (async (u: string, init: RequestInit) => {
        calls.push({ url: u, init });
        return next();
      }) as typeof fetch,
    });
    const req = {
      orderId: "o1",
      title: "Kit (M)",
      totalCents: 9050,
      buyerEmail: "ana@example.com",
      ttlMinutes: 30,
      returnUrl: "https://example.test/kit/obrigado",
    };

    expect(await p.createOrder(req)).toMatchObject({ status: "created", remoteId: "ORD1" });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toBe("https://api.mercadopago.com/v1/orders");
    expect(body).toMatchObject({
      type: "online",
      processing_mode: "manual",
      total_amount: "90.50",
      external_reference: "o1",
      expiration_time: "PT30M",
    });
    expect(body.items[0].unit_price).toBe("90.50");
    expect((calls[0].init.headers as Record<string, string>)["X-Idempotency-Key"]).toBe("o1");

    next = () => Response.json({ id: "ORD1", checkout_url: "https://evil.test/x" }, { status: 201 });
    expect((await p.createOrder(req)).status).toBe("unknown");
    next = () => new Response(null, { status: 503 });
    expect((await p.createOrder(req)).status).toBe("unknown");
    next = () => new Response(null, { status: 409 });
    expect((await p.createOrder(req)).status).toBe("unknown");
    next = () => new Response(null, { status: 400 });
    expect((await p.createOrder(req)).status).toBe("rejected");
    next = () => {
      throw new Error("TimeoutError");
    };
    expect((await p.createOrder(req)).status).toBe("unknown");

    next = () => Response.json({ errors: [{ code: "order_already_canceled" }] }, { status: 409 });
    expect(await p.cancelOrder("ORD1", "k")).toBe("canceled");
    next = () => Response.json({ errors: [{ code: "cannot_cancel_order" }] }, { status: 409 });
    expect(await p.cancelOrder("ORD1", "k")).toBe("not_cancelable");
    expect(await p.getOrder("../x")).toBeNull();
  });
});
