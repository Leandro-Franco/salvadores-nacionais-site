import "server-only";
import { serverConfig } from "@/config/server";
import { getDb } from "@/server/db";
import { MOCK_SELLER_ID } from "@/server/payments/mock";
import { paymentProvider } from "@/server/payments";
import { OrderStore } from "./postgres-repository";
import type { Deps } from "./service";

let store: OrderStore | undefined;

/**
 * Orders need Postgres: transactions, locks and the inbox have no in-memory
 * stand-in. Returns null with DATA_STORE=memory, so checkout answers
 * "unavailable" instead of pretending (security-requirements §4).
 */
export function orderDeps(): Deps | null {
  const env = serverConfig();
  if (env.DATA_STORE !== "postgres") return null;
  store ??= new OrderStore(getDb());
  return {
    store,
    provider: paymentProvider(),
    baseUrl: env.APP_BASE_URL,
    ttlMinutes: env.CHECKOUT_TTL_MINUTES,
    sellerUserId: env.PAYMENTS_MODE === "mock" ? MOCK_SELLER_ID : (env.MERCADOPAGO_USER_ID ?? ""),
    applicationId: env.MERCADOPAGO_APPLICATION_ID ?? null,
  };
}
