import { db } from './db';

const HOUR = 60 * 60 * 1000;
let lastRun = 0;
let running = false;

/**
 * Housekeeping without a job runner: at most once an hour per server instance, triggered by ordinary traffic and run
 * in the background (never delays the request). Removes rows that can no longer matter:
 * - sessions that expired or were revoked more than a week ago (kept briefly so "signed out" stays explainable),
 * - password-reset tokens that expired or were used more than a day ago,
 * - rate-limit windows idle for a day (every login attempt from a new address creates one).
 */
export function maybeRunMaintenance(): void {
  const now = Date.now();
  if (running || now - lastRun < HOUR || !process.env.DATABASE_URL || process.env.NODE_ENV === 'test') return;
  lastRun = now;
  running = true;
  void runMaintenance()
    .catch((e) => console.error('maintenance failed', e))
    .finally(() => (running = false));
}

export async function runMaintenance(): Promise<{ sessions: number; resets: number; rateLimits: number }> {
  const week = new Date(Date.now() - 7 * 24 * HOUR);
  const day = new Date(Date.now() - 24 * HOUR);
  const [sessions, resets, rateLimits] = await Promise.all([
    db().session.deleteMany({ where: { OR: [{ expiresAt: { lt: week } }, { revokedAt: { lt: week } }] } }),
    db().passwordReset.deleteMany({ where: { OR: [{ expiresAt: { lt: day } }, { usedAt: { lt: day } }] } }),
    db().rateLimit.deleteMany({ where: { windowStart: { lt: day } } }),
  ]);
  return { sessions: sessions.count, resets: resets.count, rateLimits: rateLimits.count };
}
