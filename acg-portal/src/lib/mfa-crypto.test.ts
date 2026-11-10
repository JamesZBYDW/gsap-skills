import { describe, it, expect } from 'vitest';
import {
  b64urlEncode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  loadMfaKeys,
  MfaKeyError,
  normalizeRecoveryCode,
  recoveryCodeHash,
} from './mfa-crypto';
import { base32Encode } from './totp';

const KEY = b64urlEncode(new Uint8Array(32).fill(7));

describe('MFA_ENCRYPTION_KEY', () => {
  it('accepts exactly 32 bytes in base64url or base64', async () => {
    await expect(loadMfaKeys(KEY)).resolves.toBeTruthy();
    await expect(loadMfaKeys(Buffer.alloc(32, 7).toString('base64'))).resolves.toBeTruthy();
  });
  it.each([undefined, '', 'short', b64urlEncode(new Uint8Array(31)), b64urlEncode(new Uint8Array(33)), '!!!not-base64!!!'])(
    'fails closed on %s',
    async (raw) => {
      await expect(loadMfaKeys(raw as string | undefined)).rejects.toBeInstanceOf(MfaKeyError);
    },
  );
});

describe('TOTP secret encryption', () => {
  it('round-trips, hides the secret, and is bound to the user id', async () => {
    const keys = await loadMfaKeys(KEY);
    const secret = crypto.getRandomValues(new Uint8Array(20));
    const blob = await encryptSecret(keys, 'user-1', secret);
    expect(blob).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(blob).not.toContain(base32Encode(secret));
    expect(await decryptSecret(keys, 'user-1', blob)).toEqual(secret);
    await expect(decryptSecret(keys, 'user-2', blob)).rejects.toThrow(); // moved to another account
    const other = await loadMfaKeys(b64urlEncode(new Uint8Array(32).fill(9)));
    await expect(decryptSecret(other, 'user-1', blob)).rejects.toThrow(); // wrong key
    const [v, iv, ct] = blob.split('.');
    const flipped = ct!.slice(0, -2) + (ct!.endsWith('A') ? 'BB' : 'AA');
    await expect(decryptSecret(keys, 'user-1', `${v}.${iv}.${flipped}`)).rejects.toThrow(); // tampered
    expect(await encryptSecret(keys, 'user-1', secret)).not.toBe(blob); // fresh IV
  });
});

describe('recovery codes', () => {
  it('are 10 distinct 50-bit codes in xxxxx-xxxxx form', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
  });
  it('normalize spacing, case and look-alike letters, and reject junk', () => {
    expect(normalizeRecoveryCode(' AB3CD-EF4GH ')).toBe('ab3cdef4gh');
    expect(normalizeRecoveryCode('ab3cd ef4gh')).toBe('ab3cdef4gh');
    expect(normalizeRecoveryCode('abocd-efigh')).toBe('ab0cdef1gh');
    expect(normalizeRecoveryCode('abcd')).toBeNull();
    expect(normalizeRecoveryCode('uuuuu-uuuuu')).toBeNull();
  });
  it('hash with the MFA key, per user', async () => {
    const keys = await loadMfaKeys(KEY);
    const h = await recoveryCodeHash(keys, 'user-1', 'ab3cdef4gh');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await recoveryCodeHash(keys, 'user-2', 'ab3cdef4gh')).not.toBe(h);
    expect(await recoveryCodeHash(await loadMfaKeys(b64urlEncode(new Uint8Array(32).fill(9))), 'user-1', 'ab3cdef4gh')).not.toBe(h);
  });
});
