// Key handling for two-factor authentication, on Web Crypto (Workers + Node).
//
// MFA_ENCRYPTION_KEY is a Worker secret holding exactly 32 random bytes,
// base64url- or base64-encoded (e.g. `openssl rand -base64 32`). Two
// independent subkeys are derived from it with HKDF-SHA256:
//   * AES-256-GCM for TOTP secrets, with the user id as additional data, so a
//     ciphertext cannot be moved to another account;
//   * HMAC-SHA256 for recovery codes, so the database holds no usable codes.
// Without a valid key, every 2FA operation fails closed.

export interface MfaKeys {
  enc: CryptoKey;
  mac: CryptoKey;
}

export class MfaKeyError extends Error {
  constructor() {
    super('MFA_ENCRYPTION_KEY is missing or invalid');
    this.name = 'MfaKeyError';
  }
}

export function b64urlEncode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Parse and derive the keys; throws MfaKeyError unless it is exactly 32 bytes. */
export async function loadMfaKeys(raw: string | undefined | null): Promise<MfaKeys> {
  if (!raw) throw new MfaKeyError();
  let bytes: Uint8Array;
  try {
    bytes = b64urlDecode(raw.trim());
  } catch {
    throw new MfaKeyError();
  }
  if (bytes.length !== 32) throw new MfaKeyError();
  const ikm = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) });
  const enc = await crypto.subtle.deriveKey(hkdf('acg-portal/mfa/totp-secret/v1'), ikm, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const mac = await crypto.subtle.deriveKey(hkdf('acg-portal/mfa/recovery-code/v1'), ikm, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, [
    'sign',
  ]);
  return { enc, mac };
}

const aad = (userId: string) => new TextEncoder().encode(`acg-mfa-totp:${userId}`);

/** `v1.<iv>.<ciphertext+tag>` (base64url), bound to `userId`. */
export async function encryptSecret(keys: MfaKeys, userId: string, secret: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(userId) }, keys.enc, secret));
  return `v1.${b64urlEncode(iv)}.${b64urlEncode(ct)}`;
}

/** Decrypt; throws if the blob was tampered with or belongs to another user. */
export async function decryptSecret(keys: MfaKeys, userId: string, blob: string): Promise<Uint8Array> {
  const [version, iv, ct] = blob.split('.');
  if (version !== 'v1' || !iv || !ct) throw new Error('unsupported secret format');
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(iv), additionalData: aad(userId) }, keys.enc, b64urlDecode(ct)),
  );
}

// ─── Recovery codes ─────────────────────────────────────────────────────────

// Crockford-style alphabet (no i, l, o, u): 32 symbols → 5 bits each.
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const RECOVERY_CODE_COUNT = 10;

/** 10 codes of 10 symbols (50 bits each), shown as `xxxxx-xxxxx`. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes: string[] = [];
  for (let n = 0; n < count; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const symbols = Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
    codes.push(`${symbols.slice(0, 5)}-${symbols.slice(5)}`);
  }
  return codes;
}

/** Canonical form for hashing: lowercase, no separators, ambiguous letters mapped. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input
    .toLowerCase()
    .replace(/[\s-]/g, '')
    .replace(/[il]/g, '1')
    .replace(/o/g, '0');
  return /^[0-9a-hjkmnp-tv-z]{10}$/.test(s) ? s : null;
}

export async function recoveryCodeHash(keys: MfaKeys, userId: string, normalized: string): Promise<string> {
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', keys.mac, new TextEncoder().encode(`${userId}:${normalized}`)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}
