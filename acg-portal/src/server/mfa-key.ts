import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { loadMfaKeys, MfaKeyError, type MfaKeys } from '@/lib/mfa-crypto';
import { HttpError } from '@/lib/http';

// MFA_ENCRYPTION_KEY: Worker secret, 32 random bytes, base64url or base64.
let cached: { raw: string; keys: Promise<MfaKeys> } | null = null;

/** The derived 2FA keys; HTTP 503 (fail closed) when the secret is missing or invalid. */
export async function mfaKeys(): Promise<MfaKeys> {
  let raw: string | undefined;
  try {
    raw = (getCloudflareContext().env as { MFA_ENCRYPTION_KEY?: string }).MFA_ENCRYPTION_KEY;
  } catch {
    raw = undefined;
  }
  raw ??= process.env.MFA_ENCRYPTION_KEY;
  if (!raw) throw new HttpError(503, 'Two-factor authentication is temporarily unavailable.');
  if (cached?.raw !== raw) cached = { raw, keys: loadMfaKeys(raw) };
  try {
    return await cached.keys;
  } catch (err) {
    cached = null;
    if (err instanceof MfaKeyError) throw new HttpError(503, 'Two-factor authentication is temporarily unavailable.');
    throw err;
  }
}
