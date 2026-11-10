// Password hashing with scrypt (node:crypto). Shared by the Worker (via
// password.ts) and the Node admin-bootstrap CLI, so both produce and accept
// the same format:
//
//   scrypt$ln=15,r=8,p=3$<salt base64url>$<key base64url>
//
// N = 2^15, r = 8, p = 3 (32 MiB per pass) is one of OWASP's equivalent scrypt
// settings. Argon2 is not available in Workers' node:crypto, and Workers caps
// PBKDF2 well below current guidance, so scrypt is the strongest supported
// option. These parameters were verified in a live Cloudflare Worker.
// Parameters are stored in every hash so they can be raised later.

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCRYPT_LOG_N = 15;
export const SCRYPT_R = 8;
export const SCRYPT_P = 3;
export const SCRYPT_KEYLEN = 32;
export const SCRYPT_SALT_BYTES = 16;
/** Above the 32 MiB working set (128 · N · r) so scrypt accepts the parameters. */
export const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface Params {
  logN: number;
  r: number;
  p: number;
}

function derive(password: string, salt: Buffer, params: Params, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keylen,
      { N: 2 ** params.logN, r: params.r, p: params.p, maxmem: SCRYPT_MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const params = { logN: SCRYPT_LOG_N, r: SCRYPT_R, p: SCRYPT_P };
  const key = await derive(password, salt, params, SCRYPT_KEYLEN);
  return `scrypt$ln=${params.logN},r=${params.r},p=${params.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

const FORMAT = /^scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9_-]{16,})\$([A-Za-z0-9_-]{32,})$/;

/** Parsed parameters, or null when the string is not a supported hash. */
export function parseHash(stored: string): (Params & { salt: Buffer; key: Buffer }) | null {
  const m = FORMAT.exec(stored);
  if (!m) return null;
  const params = { logN: Number(m[1]), r: Number(m[2]), p: Number(m[3]) };
  // Refuse parameters outside a sane range (a tampered hash must not be able
  // to make verification exhaust memory or CPU).
  if (params.logN < 14 || params.logN > 16 || params.r < 8 || params.r > 8 || params.p < 1 || params.p > 4) return null;
  return { ...params, salt: Buffer.from(m[4]!, 'base64url'), key: Buffer.from(m[5]!, 'base64url') };
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  try {
    const key = await derive(password, parsed.salt, parsed, parsed.key.length);
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
  } catch {
    return false;
  }
}

/** True when a stored hash uses weaker parameters than the current ones. */
export function needsRehash(stored: string): boolean {
  const parsed = parseHash(stored);
  return !parsed || parsed.logN < SCRYPT_LOG_N || parsed.p < SCRYPT_P;
}

// Basic password policy. Counsel/security may strengthen (breach checks, etc.).
export const MIN_PASSWORD_LENGTH = 10;

export function passwordPolicyError(plain: string): string | null {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return 'Password must include both letters and numbers.';
  }
  return null;
}
