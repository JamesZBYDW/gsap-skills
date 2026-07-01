import 'server-only';
import { hash, verify } from '@node-rs/argon2';

// Argon2id parameters. Tuned for interactive logins; raise on stronger hardware.
const ARGON2_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashStr, plain, ARGON2_OPTS);
  } catch {
    return false;
  }
}

// Basic password policy. Counsel/security may strengthen (breach checks, etc.).
const MIN_PASSWORD_LENGTH = 10;

export function passwordPolicyError(plain: string): string | null {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return 'Password must include both letters and numbers.';
  }
  return null;
}
