/** Identity of the person using this browser, and the JSON API client. */

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  timezone: string;
  locale: string;
  currency: string;
  avatarColor: string;
  createdAt: string;
}

export type Identity = { mode: 'local' } | { mode: 'account'; userId: string; email: string; displayName: string };

const KEY = 'lifeos.identity';

export function readIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function writeIdentity(identity: Identity | null): void {
  try {
    if (identity) localStorage.setItem(KEY, JSON.stringify(identity));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable (private mode) — the session cookie still works */
  }
}

export const accountIdentity = (user: AccountUser): Identity => ({ mode: 'account', userId: user.id, email: user.email, displayName: user.displayName });

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
  /** true when the request never reached the server */
  get offline() {
    return this.status === 0;
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: init.signal,
    });
  } catch {
    throw new ApiError(0, 'offline', 'You appear to be offline.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Request failed (${res.status})`);
  return data as T;
}
