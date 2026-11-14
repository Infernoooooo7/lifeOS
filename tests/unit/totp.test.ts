import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUri, stepAt, totpAt, verifyTotp } from '@/server/totp';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('two-step verification codes (RFC 6238)', () => {
  it('matches the RFC test vectors (SHA-1, last 6 digits)', () => {
    const cases: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
    for (const [t, code] of cases) expect(totpAt(RFC_SECRET, t * 1000)).toBe(code);
  });

  it('round-trips base32 and matches RFC 4226 HOTP', () => {
    expect(base32Decode(base32Encode(Buffer.from('hello world'))).toString()).toBe('hello world');
    expect(hotp(Buffer.from('12345678901234567890'), 0)).toBe('755224');
  });

  it('accepts one step of clock drift either way, rejects wrong and malformed codes', () => {
    const t = 1_800_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t - 30_000), t)).toBe(stepAt(t) - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t + 30_000), t)).toBe(stepAt(t) + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t - 90_000), t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '12345', t)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', t)).toBeNull();
  });

  it('never accepts the same code (or an older one) twice', () => {
    const t = 1_800_000_000_000;
    const code = totpAt(RFC_SECRET, t);
    const step = verifyTotp(RFC_SECRET, code, t)!;
    expect(verifyTotp(RFC_SECRET, code, t, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t + 30_000), t + 30_000, step)).toBe(step + 1);
  });

  it('builds the otpauth link authenticator apps scan', () => {
    expect(otpauthUri('ABC', 'me@example.com')).toBe('otpauth://totp/LIFEOS:me%40example.com?secret=ABC&issuer=LIFEOS&algorithm=SHA1&digits=6&period=30');
  });
});
