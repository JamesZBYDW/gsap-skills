import { describe, it, expect } from 'vitest';
import { base32Decode, base32Encode, hotp, otpauthUri, totpStep, verifyTotp } from './totp';

const RFC_SECRET = new TextEncoder().encode('12345678901234567890');

describe('base32', () => {
  it('round-trips and matches RFC 4648', () => {
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
    expect(new TextDecoder().decode(base32Decode('MZXW6YTBOI'))).toBe('foobar');
    const random = crypto.getRandomValues(new Uint8Array(20));
    expect(base32Decode(base32Encode(random))).toEqual(random);
    expect(() => base32Decode('not*base32')).toThrow();
  });
});

describe('RFC 6238 test vectors (SHA-1)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('t=%i → %s', async (t, expected) => {
    expect(await hotp(RFC_SECRET, totpStep(t * 1000), 8)).toBe(expected);
    expect(await hotp(RFC_SECRET, totpStep(t * 1000))).toBe(expected.slice(2));
  });
});

describe('verifyTotp', () => {
  const now = 1_111_111_111_000;
  it('accepts the current step and ±1, returning the matched step', async () => {
    const step = totpStep(now);
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, step), now)).toBe(step);
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
  });
  it('rejects codes outside the window and malformed input', async () => {
    const step = totpStep(now);
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, step - 2), now)).toBeNull();
    expect(await verifyTotp(RFC_SECRET, await hotp(RFC_SECRET, step + 2), now)).toBeNull();
    expect(await verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
    expect(await verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
  });
  it('builds a standard otpauth URI', () => {
    const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'person@example.com');
    expect(uri).toMatch(/^otpauth:\/\/totp\/ACG%20Portal%3Aperson%40example\.com\?/);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=ACG+Portal');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
