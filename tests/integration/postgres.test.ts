import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { editions, registrations } from "../../db/schema";
import { PostgresRegistrationRepository } from "@/server/registrations/postgres-repository";
import { PostgresRateLimiter } from "@/server/rate-limit/postgres";

/**
 * Runs against a disposable database (spec §18.2). The schema is dropped and
 * rebuilt from the migrations on every run, so never point this at real data.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("postgres", () => {
  const client = postgres(url ?? "", { max: 10, prepare: false, onnotice: () => {} });
  const db = drizzle(client);
  const repo = new PostgresRegistrationRepository(db);
  const base = { editionSlug: "belem-2026", name: "Ana", email: "ana@example.com", emailHash: "hash-ana" };

  beforeAll(async () => {
    await db.execute(
      sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`,
    );
    await migrate(db, { migrationsFolder: "db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate registrations, rate_limit_buckets`);
    await db.update(editions).set({ registrationOpen: true }).where(eq(editions.slug, "belem-2026"));
  });

  afterAll(async () => {
    await client.end();
  });

  it("seeds the Belém edition", async () => {
    const fresh = postgres(url ?? "", { max: 1 });
    try {
      const rows = await fresh`select slug from editions`;
      expect(rows.map((r) => r.slug)).toEqual(["belem-2026"]);
    } finally {
      await fresh.end();
    }
  });

  it("enables row level security on every table", async () => {
    const rows = await db.execute<{ relname: string; relrowsecurity: boolean }>(sql`
      select relname, relrowsecurity from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'
    `);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  it("creates once and reports duplicates", async () => {
    expect(await repo.createIfAbsent(base)).toBe("created");
    expect(await repo.createIfAbsent({ ...base, name: "Outra Ana" })).toBe("duplicate");
    const rows = await db.select().from(registrations);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ana");
  });

  it("keeps a single row under concurrent submissions", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => repo.createIfAbsent(base)));
    expect(results.filter((r) => r === "created")).toHaveLength(1);
    expect(await db.$count(registrations)).toBe(1);
  });

  it("refuses registrations while the edition is closed", async () => {
    await db.update(editions).set({ registrationOpen: false }).where(eq(editions.slug, "belem-2026"));
    expect(await repo.createIfAbsent(base)).toBe("closed");
    expect(await repo.createIfAbsent({ ...base, editionSlug: "nao-existe" })).toBe("closed");
    expect(await db.$count(registrations)).toBe(0);
  });

  it("rate-limits atomically across concurrent requests and resets after the window", async () => {
    const limiter = new PostgresRateLimiter(db, 3, 1000);
    const results = await Promise.all(Array.from({ length: 6 }, () => limiter.consume("ip-1")));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(await limiter.consume("ip-2")).toBe(true);

    await db.execute(
      sql`update rate_limit_buckets set reset_at = now() - interval '1 second' where key = 'ip-1'`,
    );
    expect(await limiter.consume("ip-1")).toBe(true);
  });
});
