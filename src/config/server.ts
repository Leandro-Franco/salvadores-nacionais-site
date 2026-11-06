import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const schema = z
  .object({
    APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
    SALES_ENABLED: bool,
    PAYMENTS_MODE: z.enum(["mock", "sandbox", "live"]).default("mock"),
    DATA_STORE: z.enum(["memory", "postgres"]).default("memory"),
    APP_BASE_URL: z.url().default("http://localhost:3000"),
    MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
    MERCADOPAGO_WEBHOOK_SECRET: z.string().optional(),
    /** Seller account (user_id) every remote order must belong to (spec §9.6). */
    MERCADOPAGO_USER_ID: z.string().regex(/^\d+$/).optional(),
    /** Application id expected in integration_data, when the API returns it. */
    MERCADOPAGO_APPLICATION_ID: z.string().regex(/^\d+$/).optional(),
    /** Minutes a checkout holds one kit. 30 is a demo value, not an approved rule (spec §9.4). */
    CHECKOUT_TTL_MINUTES: z.coerce.number().int().min(10).max(1440).default(30),
    /** Google reCAPTCHA v2 secret; when set, checkout requires the "não sou um robô" check. */
    RECAPTCHA_SECRET_KEY: z.string().optional(),
    /** Bearer secret Vercel Cron sends to /api/cron/reconcile. */
    CRON_SECRET: z.string().optional(),
    /** Set by Vercel on every deployment: production | preview | development. */
    VERCEL_ENV: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    IDENTITY_HMAC_KEY: z.string().optional(),
    RATE_LIMIT_HMAC_KEY: z.string().optional(),
    /** Confirmed kits for the goal plan while orders are not wired (Phase 1 demo only). */
    DEMO_KITS_SOLD: z.coerce.number().int().min(0).default(87),
  })
  .superRefine((env, ctx) => {
    if (env.DATA_STORE === "postgres" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Required when DATA_STORE=postgres.",
      });
    }
    if (env.APP_ENV !== "local") {
      for (const key of ["IDENTITY_HMAC_KEY", "RATE_LIMIT_HMAC_KEY"] as const) {
        if (!env[key] || env[key].length < 32) {
          ctx.addIssue({ code: "custom", path: [key], message: "Required (32+ chars) outside local." });
        }
      }
      if (env.DATA_STORE === "memory") {
        ctx.addIssue({
          code: "custom",
          path: ["DATA_STORE"],
          message: "memory store is local-only.",
        });
      }
    }
    // A Vercel deployment must never fall back to local mode, memory or local
    // keys because a variable is missing (security-requirements §4).
    if ((env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") && env.APP_ENV === "local") {
      ctx.addIssue({ code: "custom", path: ["APP_ENV"], message: "APP_ENV=local is not allowed on Vercel." });
    }
    if (env.PAYMENTS_MODE !== "mock") {
      for (const key of [
        "MERCADOPAGO_ACCESS_TOKEN",
        "MERCADOPAGO_WEBHOOK_SECRET",
        "MERCADOPAGO_USER_ID",
      ] as const) {
        if (!env[key])
          ctx.addIssue({ code: "custom", path: [key], message: "Required unless PAYMENTS_MODE=mock." });
      }
    }
    if (env.SALES_ENABLED && env.APP_ENV !== "local") {
      if (env.PAYMENTS_MODE === "mock") {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENTS_MODE"],
          message: "Sales outside local need a real provider.",
        });
      }
      if (env.DATA_STORE !== "postgres") {
        ctx.addIssue({ code: "custom", path: ["DATA_STORE"], message: "Sales need postgres." });
      }
      if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: ["CRON_SECRET"],
          message: "Sales need reconciliation (32+ chars).",
        });
      }
      if (!env.APP_BASE_URL.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["APP_BASE_URL"], message: "Must be https when sales are on." });
      }
    }
    if (env.PAYMENTS_MODE === "live" && env.APP_ENV !== "production") {
      ctx.addIssue({ code: "custom", path: ["PAYMENTS_MODE"], message: "live payments only in production." });
    }
  });

export type ServerConfig = z.infer<typeof schema>;

let cached: ServerConfig | undefined;

export function serverConfig(): ServerConfig {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Local-only fallback keys. Never used outside APP_ENV=local (enforced above). */
export function identityKey(): string {
  return serverConfig().IDENTITY_HMAC_KEY ?? "local-dev-identity-key-not-secret";
}
export function rateLimitKey(): string {
  return serverConfig().RATE_LIMIT_HMAC_KEY ?? "local-dev-rate-limit-key-not-secret";
}
