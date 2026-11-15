/**
 * Journal lock: end-to-end encryption for private entries, using only the browser's Web Crypto.
 *
 * A passphrase is stretched with PBKDF2-SHA-256 into an AES-256-GCM key that never leaves memory and is never
 * stored or sent. What syncs is the salt, the iteration count and a "check" ciphertext that lets another device
 * confirm a passphrase is right. Each sealed text has its own random 96-bit IV, and the record id is bound in as
 * additional authenticated data, so a sealed body copied onto another record does not open.
 */

export interface VaultConfig {
  v: 1;
  salt: string;
  iterations: number;
  check: Sealed;
}

export interface Sealed {
  v: 1;
  iv: string;
  ct: string;
}

/** OWASP's 2023 guidance for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000;
const CHECK_TEXT = 'lifeos:journal-lock:v1';
const CHECK_AAD = 'check';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKey(passphrase: string, salt: string, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, text: string, aad: string): Promise<Sealed> {
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(text)));
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}

/** Decrypt; throws if the key is wrong, the data was altered, or it belongs to another record. */
export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv), additionalData: enc.encode(aad) }, key, fromB64(sealed.ct));
  return dec.decode(pt);
}

export const isSealed = (value: unknown): value is Sealed =>
  !!value && typeof value === 'object' && (value as Sealed).v === 1 && typeof (value as Sealed).iv === 'string' && typeof (value as Sealed).ct === 'string';

/** A new lock: fresh salt, and a check value sealed with the derived key. */
export async function createVault(passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<{ config: VaultConfig; key: CryptoKey }> {
  const salt = toB64(random(16));
  const key = await deriveKey(passphrase, salt, iterations);
  return { config: { v: 1, salt, iterations, check: await seal(key, CHECK_TEXT, CHECK_AAD) }, key };
}

/** The key for this passphrase, or null when it is not the right one. */
export async function unlockVault(config: VaultConfig, passphrase: string): Promise<CryptoKey | null> {
  const key = await deriveKey(passphrase, config.salt, config.iterations);
  try {
    return (await open(key, config.check, CHECK_AAD)) === CHECK_TEXT ? key : null;
  } catch {
    return null;
  }
}

/** Passphrase strength hint: length matters most; a few words beat one clever word. */
export function passphraseProblem(p: string): string | null {
  if (p.length < 8) return 'Use at least 8 characters — a few words together is easy to remember and hard to guess.';
  if (/^(.)\1+$/.test(p) || /^(?:12345678|password|qwerty)/i.test(p)) return 'That passphrase is too easy to guess.';
  return null;
}
