import { orderDeps } from "@/server/orders";
import { handleNotification } from "@/server/orders/service";

const MAX_BODY = 64 * 1024;

/**
 * Mercado Pago "Order" notifications. No session, CAPTCHA or bot challenge
 * here: the signature is the authentication (security-requirements §5).
 */
export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > MAX_BODY) return new Response(null, { status: 413 });

  try {
    const deps = orderDeps();
    if (!deps) return new Response(null, { status: 503 });
    const result = await handleNotification({ url: request.url, headers: request.headers, body }, deps);
    console.info("payment_notification", { outcome: result.outcome });
    return new Response(null, { status: result.httpStatus, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Inbox not persisted: a 5xx makes the provider deliver again.
    console.error("payment_notification_failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return new Response(null, { status: 500 });
  }
}
