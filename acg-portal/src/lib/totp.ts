// RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30-second steps) and RFC 4648 base32,
// on Web Crypto so the same code runs in Workers and Node.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept the previous and next step too (clock drift of up to ±30 s). */
export const TOTP_WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The HOTP value for one counter (RFC 4226). */
export async function hotp(secret: Uint8Array, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a 6-digit code against the current step ± TOTP_WINDOW. Returns the
 * matching time step (so the caller can refuse to accept it twice), or null.
 * Every candidate is computed and compared, whatever matches.
 */
export async function verifyTotp(secret: Uint8Array, code: string, nowMs = Date.now()): Promise<number | null> {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const current = totpStep(nowMs);
  let matched: number | null = null;
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta;
    if (sameString(await hotp(secret, step), normalized) && matched === null) matched = step;
  }
  return matched;
}

export function otpauthUri(secretBase32: string, account: string, issuer = 'ACG Portal'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
