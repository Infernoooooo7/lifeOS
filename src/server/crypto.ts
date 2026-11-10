import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

// scrypt parameters follow the OWASP password storage cheat sheet (N=2^15, r=8, p=3).
const LOG_N = 15;
const R = 8;
const P = 3;
const KEYLEN = 32;

function scrypt(password: string, salt: Buffer, logN: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize('NFKC'), salt, KEYLEN, { N: 2 ** logN, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(secret, salt, LOG_N, R, P);
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

// Verified against when the account does not exist, so response time does not reveal which e-mails are registered.
const DUMMY_HASH = `scrypt$${LOG_N}$${R}$${P}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export async function verifySecret(secret: string, stored: string | null | undefined): Promise<boolean> {
  const parts = (stored || DUMMY_HASH).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, logN, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(secret, Buffer.from(salt, 'base64url'), Number(logN), Number(r), Number(p));
  const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
  return ok && !!stored;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Human-friendly recovery code: 5 groups of 4 characters, no ambiguous glyphs (~99 bits). */
export function recoveryCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  let n = 0;
  while (n < 20) {
    // Rejection sampling keeps the distribution uniform.
    const b = randomBytes(1)[0];
    if (b >= alphabet.length * Math.floor(256 / alphabet.length)) continue;
    out += alphabet[b % alphabet.length];
    n++;
    if (n % 4 === 0 && n < 20) out += '-';
  }
  return out;
}

export function normalizeRecoveryCode(code: string): string {
  const raw = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return raw.match(/.{1,4}/g)?.join('-') ?? '';
}
