import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { serverConfig } from "@/config/server";
import type { OrderStore } from "@/server/orders/postgres-repository";

const MAX_AGE_S = 7 * 24 * 60 * 60;

/** `__Host-` pins the cookie to this host over HTTPS; plain name for http://localhost. */
function cookieName(): string {
  return serverConfig().APP_BASE_URL.startsWith("https://") ? "__Host-sn_session" : "sn_session";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Anonymous visitor session (security-requirements §2): opaque 256-bit token in
 * a Secure, HttpOnly, SameSite=Lax cookie; the database keeps only its hash.
 * Lax lets the buyer come back from the provider's checkout with the cookie.
 */
export async function currentSession(store: OrderStore, create: boolean): Promise<string | null> {
  const jar = await cookies();
  const name = cookieName();
  const token = jar.get(name)?.value;
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    const id = await store.findSession(hashToken(token));
    if (id) return id;
  }
  if (!create) return null;

  const fresh = randomBytes(32).toString("base64url");
  const id = await store.createSession(hashToken(fresh), new Date(Date.now() + MAX_AGE_S * 1000));
  jar.set(name, fresh, {
    httpOnly: true,
    secure: name.startsWith("__Host-"),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
  return id;
}
