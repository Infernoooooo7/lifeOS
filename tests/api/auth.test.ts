import { beforeAll, describe, expect, it } from 'vitest';
import { Client, prepareDatabase, signUp, uniqueEmail } from './setup';

beforeAll(() => prepareDatabase());

describe('authentication', () => {
  it('registers, returns a recovery code and an httpOnly session cookie', async () => {
    const client = new Client();
    const email = uniqueEmail();
    const res = await client.call('POST', 'auth/register', { email: `  ${email.toUpperCase()} `, password: 'a-long-password' });
    expect(res.status).toBe(201);
    expect(res.data.user.email).toBe(email);
    expect(res.data.recoveryCode).toMatch(/^([A-Z0-9]{4}-){4}[A-Z0-9]{4}$/);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(JSON.stringify(res.data)).not.toContain('passwordHash');
    const me = await client.get('auth/me');
    expect(me.status).toBe(200);
    expect(me.data.user.currency).toBe('INR');
  });

  it('rejects weak passwords, invalid e-mails and duplicate accounts', async () => {
    const c = new Client();
    expect((await c.post('auth/register', { email: uniqueEmail(), password: 'short' })).status).toBe(400);
    expect((await c.post('auth/register', { email: 'not-an-email', password: 'a-long-password' })).status).toBe(400);
    const { email } = await signUp();
    const dup = await new Client().post('auth/register', { email, password: 'a-long-password' });
    expect(dup.status).toBe(409);
  });

  it('logs in with the right password only, and does not reveal which part was wrong', async () => {
    const { email, password } = await signUp();
    const wrong = await new Client().post('auth/login', { email, password: 'wrong-password-123' });
    const unknown = await new Client().post('auth/login', { email: uniqueEmail(), password: 'wrong-password-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.data.error.message).toBe(unknown.data.error.message);
    const ok = await new Client().post('auth/login', { email, password });
    expect(ok.status).toBe(200);
  });

  it('requires a session for protected endpoints', async () => {
    const anon = new Client();
    for (const [method, path] of [['GET', 'auth/me'], ['GET', 'auth/sessions'], ['POST', 'sync'], ['GET', 'export'], ['POST', 'auth/password']] as const) {
      const res = await anon.call(method, path, method === 'POST' ? { cursor: 0, changes: [] } : undefined);
      expect(res.status, `${method} ${path}`).toBe(401);
    }
    const forged = new Client();
    forged.cookie = 'lifeos_session=not-a-real-token';
    expect((await forged.get('auth/me')).status).toBe(401);
  });

  it('logout invalidates the session server-side', async () => {
    const { client } = await signUp();
    const cookie = client.cookie;
    expect((await client.post('auth/logout')).status).toBe(200);
    const replay = new Client();
    replay.cookie = cookie;
    expect((await replay.get('auth/me')).status).toBe(401);
  });

  it('lists device sessions and revokes them', async () => {
    const { client, email, password } = await signUp();
    const phone = new Client();
    await phone.post('auth/login', { email, password, deviceName: 'Pixel phone' });
    const list = await client.get('auth/sessions');
    expect(list.data.sessions).toHaveLength(2);
    expect(list.data.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const other = list.data.sessions.find((s: { current: boolean }) => !s.current);
    expect(other.deviceName).toBe('Pixel phone');
    await client.post('auth/sessions/revoke', { id: other.id });
    expect((await phone.get('auth/me')).status).toBe(401);
    expect((await client.get('auth/me')).status).toBe(200);
  });

  it("cannot revoke another account's session", async () => {
    const a = await signUp();
    const b = await signUp();
    const bSessions = await b.client.get('auth/sessions');
    await a.client.post('auth/sessions/revoke', { id: bSessions.data.sessions[0].id });
    expect((await b.client.get('auth/me')).status).toBe(200);
  });

  it('changes the password and signs out other devices', async () => {
    const { client, email, password } = await signUp();
    const other = new Client();
    await other.post('auth/login', { email, password });
    expect((await client.post('auth/password', { current: 'nope-nope-nope', next: 'brand-new-password' })).status).toBe(403);
    expect((await client.post('auth/password', { current: password, next: 'brand-new-password' })).status).toBe(200);
    expect((await other.get('auth/me')).status).toBe(401);
    expect((await new Client().post('auth/login', { email, password })).status).toBe(401);
    expect((await new Client().post('auth/login', { email, password: 'brand-new-password' })).status).toBe(200);
  });

  it('resets the password with the single-use recovery code', async () => {
    const { email, recoveryCode, client } = await signUp();
    const bad = await new Client().post('auth/reset/confirm', { email, recoveryCode: 'AAAA-AAAA-AAAA-AAAA-AAAA', password: 'another-password-1' });
    expect(bad.status).toBe(400);
    const ok = await new Client().post('auth/reset/confirm', { email, recoveryCode: recoveryCode.toLowerCase(), password: 'another-password-1' });
    expect(ok.status).toBe(200);
    expect(ok.data.recoveryCode).not.toBe(recoveryCode);
    expect((await client.get('auth/me')).status).toBe(401); // old sessions revoked
    expect((await new Client().post('auth/login', { email, password: 'another-password-1' })).status).toBe(200);
    const reuse = await new Client().post('auth/reset/confirm', { email, recoveryCode, password: 'yet-another-password' });
    expect(reuse.status).toBe(400);
  });

  it('answers reset requests identically for known and unknown e-mails', async () => {
    const { email } = await signUp();
    const known = await new Client().post('auth/reset/request', { email });
    const unknown = await new Client().post('auth/reset/request', { email: uniqueEmail() });
    expect(known.data).toEqual(unknown.data);
  });

  it('blocks cross-site state-changing requests', async () => {
    const { client } = await signUp();
    const res = await client.call('POST', 'auth/logout', {}, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect((await client.get('auth/me')).status).toBe(200);
  });

  it('rate-limits repeated login attempts', async () => {
    const { email } = await signUp();
    const attacker = new Client('203.0.113.9');
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await attacker.post('auth/login', { email, password: `guess-number-${i}` })).status;
    expect(last).toBe(429);
  });

  it('updates the profile and deletes the account with all data', async () => {
    const { client, email, password } = await signUp();
    const patch = await client.call('PATCH', 'auth/me', { displayName: 'Asha', currency: 'USD' });
    expect(patch.data.user.displayName).toBe('Asha');
    expect(patch.data.user.currency).toBe('USD');
    await client.post('sync', { cursor: 0, changes: [{ id: 't1', c: 'tasks', base: null, patch: { title: 'x' }, ca: 1, ua: 1 }] });
    expect((await client.post('auth/delete-account', { password: 'wrong-password-1' })).status).toBe(403);
    expect((await client.post('auth/delete-account', { password })).status).toBe(200);
    expect((await new Client().post('auth/login', { email, password })).status).toBe(401);
  });
});
