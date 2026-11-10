import { z } from 'zod';
import { clearCookie, createSession, deviceLabel, requireAuth } from '../auth';
import { hashSecret, normalizeRecoveryCode, randomToken, recoveryCode, sha256, verifySecret } from '../crypto';
import { db } from '../db';
import { clientIp, fail, json, readBody, requestOrigin } from '../http';
import { rateLimit } from '../ratelimit';

const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid e-mail address'));
const password = z.string().min(10, 'Password must be at least 10 characters').max(200);
const deviceName = z.string().max(60).optional();

const publicUser = (u: { id: string; email: string; createdAt: Date }, p?: { displayName: string; timezone: string; locale: string; currency: string; avatarColor: string } | null) => ({
  id: u.id,
  email: u.email,
  createdAt: u.createdAt.toISOString(),
  displayName: p?.displayName ?? '',
  timezone: p?.timezone ?? 'Asia/Kolkata',
  locale: p?.locale ?? 'en-IN',
  currency: p?.currency ?? 'INR',
  avatarColor: p?.avatarColor ?? '#22d3ee',
});

export async function register(req: Request): Promise<Response> {
  if (process.env.DISABLE_REGISTRATION === '1') fail(403, 'registration_closed', 'Registration is disabled on this deployment.');
  const body = await readBody(req, z.object({ email, password, name: z.string().trim().max(80).optional(), deviceName }));
  await rateLimit(`register:${clientIp(req)}`, 10, 3600);
  const existing = await db().user.findUnique({ where: { email: body.email } });
  if (existing) fail(409, 'email_taken', 'An account with this e-mail already exists. Sign in instead.');
  const code = recoveryCode();
  const [passwordHash, recoveryHash] = await Promise.all([hashSecret(body.password), hashSecret(code)]);
  const user = await db().user.create({
    data: { email: body.email, passwordHash, recoveryHash, profile: { create: { displayName: body.name ?? '' } } },
    include: { profile: true },
  });
  const session = await createSession(user.id, deviceLabel(req.headers.get('user-agent'), body.deviceName));
  return json({ user: publicUser(user, user.profile), recoveryCode: code }, { status: 201, headers: { 'set-cookie': session.setCookie } });
}

export async function login(req: Request): Promise<Response> {
  const body = await readBody(req, z.object({ email, password: z.string().max(200), deviceName }));
  await rateLimit(`login:${clientIp(req)}:${body.email}`, 10, 900);
  const user = await db().user.findUnique({ where: { email: body.email }, include: { profile: true } });
  const ok = await verifySecret(body.password, user?.passwordHash);
  if (!user || !ok) fail(401, 'bad_credentials', 'Incorrect e-mail or password.');
  const session = await createSession(user.id, deviceLabel(req.headers.get('user-agent'), body.deviceName));
  return json({ user: publicUser(user, user.profile) }, { headers: { 'set-cookie': session.setCookie } });
}

export async function logout(req: Request): Promise<Response> {
  const auth = await requireAuth(req).catch(() => null);
  if (auth) await db().session.update({ where: { id: auth.sessionId }, data: { revokedAt: new Date() } });
  return json({ ok: true }, { headers: { 'set-cookie': clearCookie() } });
}

export async function me(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const user = await db().user.findUnique({ where: { id: auth.userId }, include: { profile: true } });
  if (!user) fail(401, 'unauthenticated', 'Please sign in.');
  return json({ user: publicUser(user, user.profile), sessionId: auth.sessionId });
}

export async function updateProfile(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const body = await readBody(
    req,
    z.object({
      displayName: z.string().trim().max(80).optional(),
      timezone: z.string().max(64).optional(),
      locale: z.string().max(20).optional(),
      currency: z.string().regex(/^[A-Z]{3}$/).optional(),
      avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    }),
  );
  const profile = await db().profile.upsert({ where: { userId: auth.userId }, update: body, create: { userId: auth.userId, ...body } });
  const user = await db().user.findUniqueOrThrow({ where: { id: auth.userId } });
  return json({ user: publicUser(user, profile) });
}

export async function listSessions(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const sessions = await db().session.findMany({
    where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: 'desc' },
  });
  return json({
    sessions: sessions.map((s) => ({
      id: s.id, deviceName: s.deviceName, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === auth.sessionId,
    })),
  });
}

export async function revokeSessions(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const body = await readBody(req, z.object({ id: z.string().max(64).optional(), others: z.boolean().optional() }));
  if (body.others) {
    await db().session.updateMany({ where: { userId: auth.userId, id: { not: auth.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
  } else if (body.id) {
    // Scoped by userId: a session id from another account matches nothing.
    await db().session.updateMany({ where: { userId: auth.userId, id: body.id }, data: { revokedAt: new Date() } });
  } else fail(400, 'invalid', 'Specify a session id or others: true.');
  return json({ ok: true });
}

export async function changePassword(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const body = await readBody(req, z.object({ current: z.string().max(200), next: password }));
  await rateLimit(`pw:${auth.userId}`, 10, 900);
  const user = await db().user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (!(await verifySecret(body.current, user.passwordHash))) fail(403, 'bad_credentials', 'Current password is incorrect.');
  await db().$transaction([
    db().user.update({ where: { id: user.id }, data: { passwordHash: await hashSecret(body.next) } }),
    db().session.updateMany({ where: { userId: user.id, id: { not: auth.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return json({ ok: true });
}

export async function newRecoveryCode(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const body = await readBody(req, z.object({ password: z.string().max(200) }));
  await rateLimit(`pw:${auth.userId}`, 10, 900);
  const user = await db().user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (!(await verifySecret(body.password, user.passwordHash))) fail(403, 'bad_credentials', 'Password is incorrect.');
  const code = recoveryCode();
  await db().user.update({ where: { id: user.id }, data: { recoveryHash: await hashSecret(code) } });
  return json({ recoveryCode: code });
}

export const emailConfigured = () => !!process.env.RESEND_API_KEY;

/** Starts an e-mail reset. Always answers the same way so the endpoint cannot be used to probe for accounts. */
export async function requestReset(req: Request): Promise<Response> {
  const body = await readBody(req, z.object({ email }));
  await rateLimit(`reset:${clientIp(req)}`, 5, 3600);
  if (!emailConfigured()) return json({ ok: true, emailDelivery: false });
  const user = await db().user.findUnique({ where: { email: body.email } });
  if (user) {
    const token = randomToken(32);
    await db().passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    const link = `${requestOrigin(req)}/reset?token=${token}`;
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? 'LIFEOS <onboarding@resend.dev>',
          to: user.email,
          subject: 'Reset your LIFEOS password',
          text: `Use this link within one hour to choose a new password:\n\n${link}\n\nIf you did not ask for this, you can ignore this message.`,
        }),
      });
    } catch (e) {
      console.error('reset e-mail failed', e);
    }
  }
  return json({ ok: true, emailDelivery: true });
}

/** Completes a reset with either an e-mailed token or the account's recovery code. */
export async function confirmReset(req: Request): Promise<Response> {
  const body = await readBody(
    req,
    z.object({ token: z.string().max(200).optional(), email: email.optional(), recoveryCode: z.string().max(40).optional(), password }),
  );
  await rateLimit(`reset-confirm:${clientIp(req)}`, 10, 3600);
  let userId: string | null = null;
  let rotatedCode: string | null = null;
  if (body.token) {
    const reset = await db().passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() < Date.now()) fail(400, 'bad_token', 'This reset link is invalid or has expired.');
    await db().passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
    userId = reset.userId;
  } else if (body.email && body.recoveryCode) {
    await rateLimit(`recovery:${body.email}`, 5, 3600);
    const user = await db().user.findUnique({ where: { email: body.email } });
    const ok = await verifySecret(normalizeRecoveryCode(body.recoveryCode), user?.recoveryHash);
    if (!user || !ok) fail(400, 'bad_recovery', 'E-mail or recovery code is incorrect.');
    userId = user.id;
    rotatedCode = recoveryCode(); // a recovery code is single-use
  } else fail(400, 'invalid', 'Provide a reset token, or your e-mail and recovery code.');

  await db().$transaction([
    db().user.update({
      where: { id: userId },
      data: { passwordHash: await hashSecret(body.password), ...(rotatedCode ? { recoveryHash: await hashSecret(rotatedCode) } : {}) },
    }),
    db().session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return json({ ok: true, recoveryCode: rotatedCode });
}

export async function deleteAccount(req: Request): Promise<Response> {
  const auth = await requireAuth(req);
  const body = await readBody(req, z.object({ password: z.string().max(200) }));
  await rateLimit(`pw:${auth.userId}`, 10, 900);
  const user = await db().user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (!(await verifySecret(body.password, user.passwordHash))) fail(403, 'bad_credentials', 'Password is incorrect.');
  await db().user.delete({ where: { id: user.id } }); // cascades to every table
  return json({ ok: true }, { headers: { 'set-cookie': clearCookie() } });
}
