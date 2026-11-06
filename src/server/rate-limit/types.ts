export interface RateLimiter {
  /** Counts one hit for `key`; resolves true when the request is allowed. */
  consume(key: string): Promise<boolean>;
}
