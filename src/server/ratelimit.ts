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

/**
 * In-process limiter for high-frequency, low-risk endpoints (sync polling), so routine traffic does not write a
 * row on every request. It is per server instance: fine for abuse protection, and the security-sensitive limits
 * (login, registration, password reset) stay on the shared Postgres limiter above.
 */
const local = new Map<string, { count: number; start: number }>();
export function rateLimitLocal(key: string, limit: number, windowSec: number): void {
  const now = Date.now();
  const w = local.get(key);
  if (!w || now - w.start > windowSec * 1000) {
    if (local.size > 50_000) for (const [k, v] of local) if (now - v.start > windowSec * 1000) local.delete(k);
    local.set(key, { count: 1, start: now });
    return;
  }
  if (++w.count > limit) {
    const retry = Math.max(1, Math.ceil(windowSec - (now - w.start) / 1000));
    throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait and try again.', { 'retry-after': String(retry) });
  }
}
