"use server";

import { headers } from "next/headers";
import { edition } from "@/content/edition";
import { registrationInputSchema } from "@/domain/registrations/registration";
import { emailHash, registrationRepository } from "@/server/registrations";
import { clientKey, rateLimiter } from "@/server/rate-limit";

export type RegisterState =
  | { status: "idle" }
  | {
      status: "invalid";
      fieldErrors: Partial<Record<"name" | "email" | "acceptedRules", string>>;
      values: { name: string; email: string };
    }
  | { status: "received" }
  | { status: "limited" }
  | { status: "closed" }
  | { status: "unavailable" };

const EDITION_SLUG = "belem-2026";
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

export async function register(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!edition.registration.open) return { status: "closed" };

  // Honeypot: real people never fill this hidden field. Answer like a success.
  if (String(formData.get("website") ?? "") !== "") return { status: "received" };

  try {
    // On Vercel, x-forwarded-for is set by the platform; its first entry is the client.
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
    if (!(await rateLimiter("register", LIMIT, WINDOW_MS).consume(clientKey(ip))))
      return { status: "limited" };
  } catch (error) {
    console.error("rate_limit_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { status: "unavailable" };
  }

  const parsed = registrationInputSchema.safeParse({
    name: formData.get("name") ?? "",
    email: formData.get("email") ?? "",
    acceptedRules: formData.get("acceptedRules") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<"name" | "email" | "acceptedRules", string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "name" | "email" | "acceptedRules";
      fieldErrors[key] ??= issue.message;
    }
    return {
      status: "invalid",
      fieldErrors,
      values: {
        name: String(formData.get("name") ?? "").slice(0, 80),
        email: String(formData.get("email") ?? "").slice(0, 254),
      },
    };
  }

  try {
    // "created" and "duplicate" get the same answer so nobody learns who is registered (RF-05).
    const result = await registrationRepository().createIfAbsent({
      editionSlug: EDITION_SLUG,
      name: parsed.data.name,
      email: parsed.data.email,
      emailHash: emailHash(parsed.data.email),
    });
    return result === "closed" ? { status: "closed" } : { status: "received" };
  } catch (error) {
    console.error("registration_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { status: "unavailable" };
  }
}
