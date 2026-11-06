import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RateLimiter } from "./types";

/** Fixed window shared across instances; one atomic upsert per request. */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly db: PostgresJsDatabase,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<boolean> {
    const seconds = this.windowMs / 1000;
    const rows = await this.db.execute<{ count: number }>(sql`
      insert into rate_limit_buckets (key, count, reset_at)
      values (${key}, 1, now() + make_interval(secs => ${seconds}))
      on conflict (key) do update set
        count = case when rate_limit_buckets.reset_at <= now() then 1 else rate_limit_buckets.count + 1 end,
        reset_at = case when rate_limit_buckets.reset_at <= now() then excluded.reset_at else rate_limit_buckets.reset_at end
      returning count
    `);
    return Number(rows[0]?.count ?? Infinity) <= this.limit;
  }
}
