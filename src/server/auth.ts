import { db } from './db';
import { randomToken, sha256 } from './crypto';
import { HttpError, parseCookies } from './http';

export const SESSION_COOKIE = 'lifeos_session';
const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export interface AuthContext {
  userId: string;
  sessionId: string;
}

function cookie(value: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export const clearCookie = () => cookie('', 0);

/** Short, non-identifying device label derived from the user agent ("Chrome on Android"). */
export function deviceLabel(userAgent: string | null, provided?: string): string {
  if (provided?.trim()) return provided.trim().slice(0, 60);
  const ua = userAgent ?? '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'device';
  return `${browser} on ${os}`;
}

export async function createSession(userId: string, deviceName: string): Promise<{ id: string; setCookie: string }> {
  const token = randomToken(32);
  const session = await db().session.create({
    data: { userId, tokenHash: sha256(token), deviceName, expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) },
  });
  return { id: session.id, setCookie: cookie(token, SESSION_DAYS * 24 * 60 * 60) };
}

/** Resolve the session cookie. Returns null when there is no valid session. */
export async function getAuth(req: Request): Promise<AuthContext | null> {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token || token.length > 200) return null;
  const session = await db().session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  // Rolling expiry, written at most every 10 minutes to keep reads cheap.
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60 * 1000) {
    await db().session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) },
    });
  }
  return { userId: session.userId, sessionId: session.id };
}

export async function requireAuth(req: Request): Promise<AuthContext> {
  const auth = await getAuth(req);
  if (!auth) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  return auth;
}
