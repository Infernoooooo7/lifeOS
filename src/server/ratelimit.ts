import { db } from './db';
import { HttpError } from './http';

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across serverless instances
 * without Redis. One atomic upsert per check.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const rows = await db().$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO rate_limits (key, count, "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."windowStart" < now() - make_interval(secs => ${windowSec}::int) THEN 1 ELSE rate_limits.count + 1 END,
      "windowStart" = CASE WHEN rate_limits."windowStart" < now() - make_interval(secs => ${windowSec}::int) THEN now() ELSE rate_limits."windowStart" END
    RETURNING count, "windowStart"`;
  const row = rows[0];
  if (row && row.count > limit) {
    const retry = Math.max(1, Math.ceil(windowSec - (Date.now() - new Date(row.windowStart).getTime()) / 1000));
    throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait and try again.', { 'retry-after': String(retry) });
  }
}
