import type { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...init.headers },
  });
}

export function fail(status: number, code: string, message: string): never {
  throw new HttpError(status, code, message);
}

const MAX_BODY = 6 * 1024 * 1024;

export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) fail(413, 'too_large', 'Request body is too large.');
    raw = text ? JSON.parse(text) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    fail(400, 'bad_json', 'Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail(400, 'invalid', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return parsed.data;
}

export function parseCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out;
}

/**
 * Client address for rate limiting. Headers set by the hosting platform's edge are preferred because the
 * left-most X-Forwarded-For entry can be supplied by the client on platforms that append to it.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    h.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
    (h.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    'local'
  ).slice(0, 64);
}

/** Public origin of this deployment as seen by the browser. */
export function requestOrigin(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/**
 * CSRF defence in depth: the session cookie is SameSite=Lax, and state-changing requests that carry an
 * Origin header must come from this deployment.
 */
export function assertSameOrigin(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const origin = req.headers.get('origin');
  if (!origin) return;
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    fail(403, 'bad_origin', 'Cross-site request blocked.');
  }
  const allowed = new Set([new URL(requestOrigin(req)).host, req.headers.get('host') ?? '', new URL(req.url).host]);
  if (!allowed.has(originHost)) fail(403, 'bad_origin', 'Cross-site request blocked.');
}
