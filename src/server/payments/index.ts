import "server-only";
import { serverConfig } from "@/config/server";
import { MercadoPagoOrdersProvider } from "./mercadopago";
import { MockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./types";

let provider: PaymentProvider | undefined;

/** PAYMENTS_MODE=mock stays in-process; sandbox/live call Mercado Pago (config enforces the keys). */
export function paymentProvider(): PaymentProvider {
  if (provider) return provider;
  const env = serverConfig();
  provider =
    env.PAYMENTS_MODE === "mock"
      ? new MockPaymentProvider()
      : new MercadoPagoOrdersProvider({
          accessToken: env.MERCADOPAGO_ACCESS_TOKEN ?? "",
          webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
        });
  return provider;
}
