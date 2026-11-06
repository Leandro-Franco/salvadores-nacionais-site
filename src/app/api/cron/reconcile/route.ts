import { randomUUID, timingSafeEqual } from "node:crypto";
import { serverConfig } from "@/config/server";
import { orderDeps } from "@/server/orders";
import { reconcile } from "@/server/orders/service";

/**
 * Scheduled reconciliation, called by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`. Not public: no secret, no run.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverConfig().CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  if (
    !secret ||
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  ) {
    return new Response(null, { status: 401 });
  }

  const deps = orderDeps();
  if (!deps) return new Response(null, { status: 503 });
  try {
    const report = await reconcile(deps, { holder: randomUUID() });
    console.info("reconcile", report ?? { skipped: "lease_held" });
    return Response.json(report ?? { skipped: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("reconcile_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return new Response(null, { status: 500 });
  }
}
