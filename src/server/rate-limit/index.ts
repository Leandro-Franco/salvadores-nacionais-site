import "server-only";
import { createHmac } from "node:crypto";
import { rateLimitKey, serverConfig } from "@/config/server";
import { getDb } from "@/server/db";
import { FixedWindowLimiter } from "./fixed-window";
import { PostgresRateLimiter } from "./postgres";
import type { RateLimiter } from "./types";

const cache = new Map<string, RateLimiter>();

/** Returns a limiter for a named action, e.g. "register". Keys are scoped by name. */
export function rateLimiter(name: string, limit: number, windowMs: number): RateLimiter {
  const id = `${name}:${limit}:${windowMs}`;
  let limiter = cache.get(id);
  if (!limiter) {
    if (serverConfig().DATA_STORE === "postgres") {
      const pg = new PostgresRateLimiter(getDb(), limit, windowMs);
      limiter = { consume: (key) => pg.consume(`${name}:${key}`) };
    } else {
      const mem = new FixedWindowLimiter(limit, windowMs);
      limiter = { consume: async (key) => mem.consume(key) };
    }
    cache.set(id, limiter);
  }
  return limiter;
}

/** Pseudonymous key for an IP address, so raw IPs are never stored. */
export function clientKey(ip: string): string {
  return createHmac("sha256", rateLimitKey()).update(ip).digest("hex");
}
