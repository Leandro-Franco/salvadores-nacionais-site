"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { serverConfig } from "@/config/server";
import { edition } from "@/content/edition";
import { checkoutInputSchema } from "@/domain/orders/order";
import { orderDeps } from "@/server/orders";
import { cancelOpenOrder, startCheckout } from "@/server/orders/service";
import { clientKey, rateLimiter } from "@/server/rate-limit";
import { verifyHuman } from "@/server/bot/recaptcha";
import { currentSession } from "@/server/session";

type Field = "name" | "email" | "print" | "size" | "acceptedTerms";

export type CheckoutState =
  | { status: "idle" }
  | {
      status: "invalid";
      fieldErrors: Partial<Record<Field, string>>;
      values: { name: string; email: string };
    }
  | { status: "closed" }
  | { status: "sold_out" }
  | { status: "limited" }
  | { status: "in_progress" }
  | { status: "other_open_order"; url: string | null }
  | { status: "canceled" }
  | { status: "bot_check" }
  | { status: "unavailable" };

const EDITION_SLUG = "belem-2026";
/** One checkout attempt per client every 15 seconds (organizer's choice, 2026-11-06). */
const LIMIT = 1;
const WINDOW_MS = 15 * 1000;

export async function checkout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  // The server switch is authoritative, whatever the page showed (spec §19.3).
  if (!serverConfig().SALES_ENABLED) return { status: "closed" };
  if (String(formData.get("website") ?? "") !== "") return { status: "closed" };

  const parsed = checkoutInputSchema({
    prints: edition.kit.prints.map((p) => p.id),
    sizes: edition.kit.sizes,
  }).safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    print: formData.get("print") ?? "",
    size: formData.get("size") ?? "",
    acceptedTerms: formData.get("acceptedTerms") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<Field, string>> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as Field] ??= issue.message;
    return {
      status: "invalid",
      fieldErrors,
      values: {
        name: String(formData.get("name") ?? "").slice(0, 80),
        email: String(formData.get("email") ?? "").slice(0, 254),
      },
    };
  }

  // Cheap checks first; only valid submissions spend an attempt. Then the
  // limiter and the bot check run before any order, stock or provider call.
  let ip = "unknown";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    if (!(await rateLimiter("checkout", LIMIT, WINDOW_MS).consume(clientKey(ip))))
      return { status: "limited" };
  } catch (error) {
    console.error("rate_limit_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { status: "unavailable" };
  }
  if (!(await verifyHuman(String(formData.get("g-recaptcha-response") ?? ""), ip)))
    return { status: "bot_check" };

  let url: string;
  try {
    const deps = orderDeps();
    if (!deps) return { status: "unavailable" };
    const sessionId = await currentSession(deps.store, true);
    if (!sessionId) return { status: "unavailable" };
    const result = await startCheckout(parsed.data, EDITION_SLUG, sessionId, deps);
    if (result.status !== "redirect") return result;
    url = result.url;
  } catch (error) {
    console.error("checkout_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return { status: "unavailable" };
  }
  redirect(url);
}

/** Lets the buyer drop an open order to start a different one. */
export async function cancelCheckout(): Promise<CheckoutState> {
  try {
    const deps = orderDeps();
    if (!deps) return { status: "unavailable" };
    const sessionId = await currentSession(deps.store, false);
    if (!sessionId) return { status: "idle" };
    const result = await cancelOpenOrder(sessionId, deps);
    return result === "not_canceled" ? { status: "in_progress" } : { status: "canceled" };
  } catch (error) {
    console.error("checkout_cancel_failed", { reason: error instanceof Error ? error.message : "unknown" });
    return { status: "unavailable" };
  }
}
