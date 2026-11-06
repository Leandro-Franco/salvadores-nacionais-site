import { createHmac, timingSafeEqual } from "node:crypto";
import type { RemoteOrder } from "@/domain/orders/order";
import type { CancelResult, CreateRemoteOrder, CreateResult, PaymentProvider } from "./types";

/** Fixed host: resource ids from notifications never choose where we call (spec §10.2). */
const API = "https://api.mercadopago.com";
const TIMEOUT_MS = 10_000;
/** Exact hosts the buyer may be sent to (spec §9.2 step 8). */
export const CHECKOUT_HOSTS = ["www.mercadopago.com.br", "mercadopago.com.br", "sandbox.mercadopago.com.br"];
const REMOTE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Mercado Pago Checkout Pro via the Orders API (docs/decisions/0004-pagamentos.md).
 * Only the Orders family is used here: payloads, ids, signatures and states
 * from Preferences/Payments are never mixed in (spec §9.1).
 * Plain fetch instead of the SDK: three endpoints do not justify a dependency.
 */
export class MercadoPagoOrdersProvider implements PaymentProvider {
  readonly name = "mercadopago";

  constructor(
    private readonly opts: {
      accessToken: string;
      webhookSecret: string;
      fetch?: typeof fetch;
    },
  ) {}

  async createOrder(req: CreateRemoteOrder): Promise<CreateResult> {
    const amount = centsToDecimal(req.totalCents);
    const body = {
      type: "online",
      processing_mode: "manual",
      total_amount: amount,
      external_reference: req.orderId,
      expiration_time: `PT${req.ttlMinutes}M`,
      payer: { email: req.buyerEmail },
      items: [{ title: req.title, unit_price: amount, quantity: 1, external_code: "kit" }],
      config: {
        statement_descriptor: "SALVADORES",
        online: {
          success_url: req.returnUrl,
          failure_url: req.returnUrl,
          pending_url: req.returnUrl,
          auto_return: "approved",
        },
        // Boleto/ATM settle in days, longer than the stock hold (spec §9.4).
        payment_method: { not_allowed_types: ["ticket", "atm"], max_installments: 1 },
      },
    };

    let res: Response;
    try {
      res = await this.call("/v1/orders", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "X-Idempotency-Key": req.orderId },
      });
    } catch (error) {
      return { status: "unknown", reason: error instanceof Error ? error.name : "network" };
    }

    if (res.status === 200 || res.status === 201) {
      const data = (await res.json().catch(() => null)) as { id?: string; checkout_url?: string } | null;
      if (!data?.id || !REMOTE_ID.test(data.id) || !isAllowedCheckoutUrl(data.checkout_url))
        return { status: "unknown", reason: "invalid_response" };
      return { status: "created", remoteId: data.id, checkoutUrl: data.checkout_url! };
    }
    // 409 (key already used), 423 (locked), 429 and 5xx: the order may exist.
    if (res.status === 409 || res.status === 423 || res.status === 429 || res.status >= 500)
      return { status: "unknown", reason: `http_${res.status}` };
    return { status: "rejected", reason: `http_${res.status}` };
  }

  async getOrder(remoteId: string): Promise<RemoteOrder | null> {
    if (!REMOTE_ID.test(remoteId)) return null;
    const res = await this.call(`/v1/orders/${remoteId}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`mercadopago_get_order_${res.status}`);
    return parseOrder(await res.json());
  }

  async cancelOrder(remoteId: string, idempotencyKey: string): Promise<CancelResult> {
    if (!REMOTE_ID.test(remoteId)) return "not_found";
    try {
      const res = await this.call(`/v1/orders/${remoteId}/cancel`, {
        method: "POST",
        headers: { "X-Idempotency-Key": idempotencyKey },
      });
      if (res.ok) return "canceled";
      if (res.status === 404) return "not_found";
      if (res.status === 409) {
        const err = (await res.json().catch(() => null)) as { errors?: { code?: string }[] } | null;
        const code = err?.errors?.[0]?.code;
        return code === "order_already_canceled" ? "canceled" : "not_cancelable";
      }
      return "error";
    } catch {
      return "error";
    }
  }

  verifyNotification({ url, headers, body }: { url: string; headers: Headers; body: string }) {
    const params = new URL(url).searchParams;
    const dataId = params.get("data.id");
    const type = params.get("type") ?? parseType(body);
    if (!dataId || !REMOTE_ID.test(dataId) || type !== "order") return null;

    const signature = headers.get("x-signature");
    const requestId = headers.get("x-request-id")?.trim() || null;
    if (!signature) return null;

    let ts: string | undefined;
    let v1: string | undefined;
    for (const part of signature.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim().toLowerCase();
      const value = part.slice(eq + 1).trim();
      if (key === "ts") ts = value;
      if (key === "v1") v1 = value;
    }
    if (!ts || !/^\d+$/.test(ts) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return null;

    // Manifest as built by Mercado Pago's official SDK; pairs without a value
    // are omitted. No timestamp window: legitimate retries reuse old values
    // (spec §10.1.5) and processing is idempotent anyway.
    // Older docs lowercase alphanumeric ids, the SDK does not: accept either.
    const given = Buffer.from(v1, "hex");
    const matches = (id: string) => {
      const manifest = `id:${id};${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
      const expected = createHmac("sha256", this.opts.webhookSecret).update(manifest).digest();
      return expected.length === given.length && timingSafeEqual(expected, given);
    };
    if (!matches(dataId) && !matches(dataId.toLowerCase())) return null;
    return { topic: "order", resourceId: dataId };
  }

  private call(path: string, init: RequestInit): Promise<Response> {
    const doFetch = this.opts.fetch ?? fetch;
    return doFetch(`${API}${path}`, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${this.opts.accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  }
}

export function isAllowedCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && CHECKOUT_HOSTS.includes(u.hostname) && !u.username && !u.port;
  } catch {
    return false;
  }
}

/** "90.00" -> 9000, parsed as a string so floats never round money. */
export function decimalToCents(value: unknown): number {
  if (typeof value === "number") value = value.toFixed(2);
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value)) return NaN;
  const [units, frac = ""] = value.split(".");
  return Number(units) * 100 + Number(frac.padEnd(2, "0"));
}

function centsToDecimal(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

interface ApiOrder {
  id?: string;
  external_reference?: string | null;
  user_id?: string | number | null;
  integration_data?: { application_id?: string | number | null } | null;
  status?: string;
  status_detail?: string | null;
  currency?: string | null;
  total_amount?: string;
  total_paid_amount?: string | null;
  transactions?: {
    refunds?: { amount?: string; status?: string }[];
    chargebacks?: unknown[];
  } | null;
}

export function parseOrder(raw: unknown): RemoteOrder {
  const o = raw as ApiOrder;
  if (!o?.id || !o.status) throw new Error("mercadopago_order_invalid");
  const refunded = (o.transactions?.refunds ?? [])
    .filter((r) => r.status === "processed")
    .reduce((sum, r) => sum + decimalToCents(r.amount), 0);
  const total = decimalToCents(o.total_amount);
  const paid = o.total_paid_amount == null ? 0 : decimalToCents(o.total_paid_amount);
  if ([total, paid, refunded].some(Number.isNaN)) throw new Error("mercadopago_order_amount_invalid");
  return {
    id: o.id,
    externalReference: o.external_reference ?? null,
    userId: o.user_id == null ? null : String(o.user_id),
    applicationId:
      o.integration_data?.application_id == null ? null : String(o.integration_data.application_id),
    status: o.status,
    statusDetail: o.status_detail ?? null,
    currency: o.currency ?? null,
    totalCents: total,
    paidCents: paid,
    refundedCents: refunded,
    hasChargeback: (o.transactions?.chargebacks ?? []).length > 0,
  };
}

function parseType(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : null;
  } catch {
    return null;
  }
}
