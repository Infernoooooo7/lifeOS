import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { runMaintenance } from '@/server/maintenance';
import { prepareDatabase, signUp } from './setup';

beforeAll(() => prepareDatabase());

describe('housekeeping', () => {
  it('removes long-expired sessions, used reset tokens and idle rate-limit windows, and keeps live sessions working', async () => {
    const { client, user } = await signUp();
    const old = new Date(Date.now() - 30 * 24 * 3600_000);
    const dead = await db().session.create({ data: { userId: user.id, tokenHash: `dead-${Date.now()}`, expiresAt: old } });
    const revoked = await db().session.create({ data: { userId: user.id, tokenHash: `rev-${Date.now()}`, expiresAt: new Date(Date.now() + 3600_000), revokedAt: old } });
    const reset = await db().passwordReset.create({ data: { userId: user.id, tokenHash: `rs-${Date.now()}`, expiresAt: old } });
    await db().rateLimit.create({ data: { key: `stale-${Date.now()}`, count: 3, windowStart: old } });
    const fresh = `fresh-${Date.now()}`;
    await db().rateLimit.create({ data: { key: fresh, count: 1 } });

    const removed = await runMaintenance();
    expect(removed.sessions).toBeGreaterThanOrEqual(2);
    expect(removed.resets).toBeGreaterThanOrEqual(1);
    expect(removed.rateLimits).toBeGreaterThanOrEqual(1);
    expect(await db().session.findUnique({ where: { id: dead.id } })).toBeNull();
    expect(await db().session.findUnique({ where: { id: revoked.id } })).toBeNull();
    expect(await db().passwordReset.findUnique({ where: { id: reset.id } })).toBeNull();
    expect(await db().rateLimit.findUnique({ where: { key: fresh } })).not.toBeNull();
    // The signed-in device is untouched.
    expect((await client.get('auth/me')).status).toBe(200);
  });

  it('answers an idle sync poll with a single database query', async () => {
    const { client } = await signUp();
    await client.post('sync', { cursor: 0, changes: [] });
    const pg = await import('pg');
    let count = 0;
    const orig = pg.default.Client.prototype.query;
    pg.default.Client.prototype.query = function (this: unknown, ...args: unknown[]) {
      count++;
      return (orig as (...a: unknown[]) => unknown).apply(this, args);
    } as typeof orig;
    try {
      const res = await client.post('sync', { cursor: 0, changes: [] });
      expect(res.status).toBe(200);
      expect(count).toBe(1);
    } finally {
      pg.default.Client.prototype.query = orig;
    }
  });
});
