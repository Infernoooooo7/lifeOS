import { execSync } from 'node:child_process';
import { handle } from '@/server/api';

/** API tests run against a real PostgreSQL database (TEST_DATABASE_URL), migrated from prisma/migrations. */
export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/lifeos_test';

export function prepareDatabase() {
  process.env.DATABASE_URL = TEST_DB;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: 'pipe' });
}

export class Client {
  cookie = '';
  constructor(public ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`) {}

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await handle(
      new Request(`http://localhost:3000/api/${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'x-forwarded-for': this.ip,
          ...(this.cookie ? { cookie: this.cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  }
  get = (path: string) => this.call('GET', path);
  post = (path: string, body: unknown = {}) => this.call('POST', path, body);
}

let n = 0;
export const uniqueEmail = () => `user${Date.now()}_${n++}@example.com`;

export async function signUp(password = 'correct horse battery') {
  const client = new Client();
  const email = uniqueEmail();
  const res = await client.post('auth/register', { email, password, name: 'Test' });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.data)}`);
  return { client, email, password, user: res.data.user, recoveryCode: res.data.recoveryCode as string };
}
