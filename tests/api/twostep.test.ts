import { beforeAll, describe, expect, it } from 'vitest';
import { totpAt } from '@/server/totp';
import { Client, prepareDatabase, signUp } from './setup';

beforeAll(() => prepareDatabase());

const login = (c: Client, email: string, password: string, code?: string) => c.post('auth/login', { email, password, ...(code ? { code } : {}) });

describe('two-step verification', () => {
  it('turns on only after a valid code, then guards sign-in', async () => {
    const { client, email, password } = await signUp();
    expect((await client.post('auth/2fa/setup', { password: 'wrong password!' })).status).toBe(403);
    const setup = await client.post('auth/2fa/setup', { password });
    expect(setup.status).toBe(200);
    expect(setup.data.uri).toMatch(/^otpauth:\/\/totp\/LIFEOS:/);
    const secret = setup.data.secret as string;

    expect((await client.post('auth/2fa/enable', { code: '000000' })).status).toBe(400);
    expect((await client.post('auth/2fa/enable', { code: totpAt(secret, Date.now()) })).status).toBe(200);
    expect((await client.get('auth/me')).data.user.twoStep).toBe(true);

    const phone = new Client();
    const first = await login(phone, email, password);
    expect(first.status).toBe(401);
    expect(first.data.error.code).toBe('totp_required');
    expect(phone.cookie).toBe(''); // no session without the code
    expect((await login(phone, email, password, '123456')).data.error.code).toBe('bad_totp');

    // The current code was used to enable; the next step's code signs in once, and only once.
    const next = totpAt(secret, Date.now() + 30_000);
    expect((await login(phone, email, password, next)).status).toBe(200);
    expect((await phone.get('auth/me')).status).toBe(200);
    const replay = await login(new Client(), email, password, next);
    expect(replay.status).toBe(401);
  });

  it('can be turned off with the password', async () => {
    const { client, email, password } = await signUp();
    const { secret } = (await client.post('auth/2fa/setup', { password })).data;
    await client.post('auth/2fa/enable', { code: totpAt(secret, Date.now()) });
    expect((await client.post('auth/2fa/disable', { password: 'not the password' })).status).toBe(403);
    expect((await client.post('auth/2fa/disable', { password })).status).toBe(200);
    expect((await login(new Client(), email, password)).status).toBe(200);
  });

  it('is switched off by a recovery-code reset, which is the way back in after losing the phone', async () => {
    const { client, email, password, recoveryCode } = await signUp();
    const { secret } = (await client.post('auth/2fa/setup', { password })).data;
    await client.post('auth/2fa/enable', { code: totpAt(secret, Date.now()) });
    const reset = await new Client().post('auth/reset/confirm', { email, recoveryCode, password: 'a brand new password' });
    expect(reset.status).toBe(200);
    const after = await login(new Client(), email, 'a brand new password');
    expect(after.status).toBe(200);
    expect(after.data.user.twoStep).toBe(false);
  });

  it('a setup that was never confirmed does not affect sign-in', async () => {
    const { client, email, password } = await signUp();
    await client.post('auth/2fa/setup', { password });
    expect((await login(new Client(), email, password)).status).toBe(200);
  });
});
