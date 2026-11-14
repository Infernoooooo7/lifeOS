import { z } from 'zod';
import { MAX_CHANGES_PER_PUSH } from '@/core/sync/protocol';
import { requireAuth } from '../auth';
import { db } from '../db';
import { HttpError, assertSameOrigin, json, readBody } from '../http';
import { maybeRunMaintenance } from '../maintenance';
import { rateLimit, rateLimitLocal } from '../ratelimit';
import { exportAll, sync } from '../sync/engine';
import * as auth from './auth';

type Handler = (req: Request) => Promise<Response>;

const syncBody = z.object({
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  changes: z
    .array(
      z.object({
        id: z.string().max(128),
        c: z.string().max(40),
        base: z.record(z.string(), z.unknown()).nullable(),
        patch: z.record(z.string(), z.unknown()),
        ca: z.number(),
        ua: z.number(),
      }),
    )
    .max(MAX_CHANGES_PER_PUSH),
});

const syncRoute: Handler = async (req) => {
  const ctx = await requireAuth(req);
  const body = await readBody(req, syncBody);
  rateLimitLocal(`sync:${ctx.userId}`, 240, 60);
  return json(await sync(ctx.userId, body.cursor, body.changes, 500, ctx.syncSeq));
};

const exportRoute: Handler = async (req) => {
  const ctx = await requireAuth(req);
  await rateLimit(`export:${ctx.userId}`, 10, 600);
  const user = await db().user.findUniqueOrThrow({ where: { id: ctx.userId }, include: { profile: true } });
  const records = await exportAll(ctx.userId);
  return json({
    format: 'lifeos-account-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.createdAt.toISOString(), profile: user.profile },
    records,
  });
};

const health: Handler = async () => {
  try {
    await db().$queryRaw`SELECT 1`;
    return json({ ok: true, db: true, email: auth.emailConfigured(), registration: process.env.DISABLE_REGISTRATION !== '1' });
  } catch {
    return json({ ok: false, db: false }, { status: 503 });
  }
};

/** Route table: "METHOD path" → handler. One place to see the whole API surface. */
const routes: Record<string, Handler> = {
  'GET health': health,
  'POST auth/register': auth.register,
  'POST auth/login': auth.login,
  'POST auth/logout': auth.logout,
  'GET auth/me': auth.me,
  'PATCH auth/me': auth.updateProfile,
  'GET auth/sessions': auth.listSessions,
  'POST auth/sessions/revoke': auth.revokeSessions,
  'POST auth/password': auth.changePassword,
  'POST auth/recovery-code': auth.newRecoveryCode,
  'POST auth/reset/request': auth.requestReset,
  'POST auth/reset/confirm': auth.confirmReset,
  'POST auth/delete-account': auth.deleteAccount,
  'POST sync': syncRoute,
  'GET export': exportRoute,
};

/** Framework-independent entry point (`Request` → `Response`), so the API is testable without Next.js. */
export async function handle(req: Request): Promise<Response> {
  const started = performance.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  const path = new URL(req.url).pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const route = `${req.method} ${path}`;
  let res: Response;
  try {
    const handler = routes[route];
    if (!handler) res = json({ error: { code: 'not_found', message: 'Unknown endpoint.' } }, { status: 404 });
    else {
      assertSameOrigin(req);
      maybeRunMaintenance();
      res = await handler(req);
    }
  } catch (e) {
    if (e instanceof HttpError) res = json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: e.headers });
    else {
      console.error(JSON.stringify({ level: 'error', requestId, route, error: e instanceof Error ? `${e.name}: ${e.message}` : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(1, 6).join(' | ') : undefined }));
      res = json({ error: { code: 'internal', message: `Something went wrong on the server (reference ${requestId}).` } }, { status: 500 });
    }
  }
  // One structured line for anything slow or failed; routine fast requests stay quiet.
  const ms = Math.round(performance.now() - started);
  if (ms > 800 || res.status >= 500) console.log(JSON.stringify({ level: res.status >= 500 ? 'error' : 'warn', requestId, route, status: res.status, ms }));
  res.headers.set('x-request-id', requestId);
  return res;
}
