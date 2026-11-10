import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Documents are private. Same-origin downloads are gated by session + ownership.
// For out-of-band / CDN delivery we also support short-lived signed tokens so a
// link can be emailed without exposing the object publicly.

/**
 * The signing secret. Fails closed: with no (or a too-short) secret configured,
 * no token can be created or verified — downloads then require a session.
 */
function secret(): string | null {
  const s = process.env.DOCUMENT_URL_SECRET;
  return s && s.length >= 32 ? s : null;
}

function ttlSeconds(): number {
  return Number(process.env.DOCUMENT_URL_TTL_SECONDS ?? '300');
}

/** Create a signed token "<exp>.<hmac>" granting access to one document. */
export function signDocumentToken(documentId: string, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error('DOCUMENT_URL_SECRET is not configured');
  const exp = Math.floor(now / 1000) + ttlSeconds();
  const mac = createHmac('sha256', key).update(`${documentId}.${exp}`).digest('base64url');
  return `${exp}.${mac}`;
}

/** Verify a signed token for a document. Returns true when valid and unexpired. */
export function verifyDocumentToken(documentId: string, token: string | null, now = Date.now()): boolean {
  const key = secret();
  if (!token || !key) return false;
  const parts = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!parts) return false;
  const [, expStr, mac] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = createHmac('sha256', key).update(`${documentId}.${exp}`).digest('base64url');
  const a = Buffer.from(mac!);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
