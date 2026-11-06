/**
 * Fixed-window limiter kept in process memory.
 * Good enough for the local demo; production needs the distributed limiter
 * backed by PostgreSQL plus the hosting WAF (spec §12) — see docs/open-questions.md.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true when the request is allowed. */
  consume(key: string): boolean {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      this.prune(t);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private prune(t: number) {
    if (this.hits.size < 10_000) return;
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
