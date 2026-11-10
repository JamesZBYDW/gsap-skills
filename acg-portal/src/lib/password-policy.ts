// The single password policy for every place a password is created or
// changed: management-issued logins, the forced first-login set, the
// investor's own change, and the admin bootstrap CLI. Pure and client-safe
// (no imports), so client components can show the same hint and limits.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with letters and numbers.`;

export const PASSWORD_TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
export const PASSWORD_TOO_LONG = `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
export const PASSWORD_NEEDS_MIX = 'Password must include both letters and numbers.';

export function hasLettersAndNumbers(plain: string): boolean {
  return /[a-zA-Z]/.test(plain) && /[0-9]/.test(plain);
}

/** The first policy violation, or null when the password is acceptable. */
export function passwordPolicyError(plain: string): string | null {
  if (typeof plain !== 'string' || plain.length < PASSWORD_MIN_LENGTH) return PASSWORD_TOO_SHORT;
  if (plain.length > PASSWORD_MAX_LENGTH) return PASSWORD_TOO_LONG;
  if (!hasLettersAndNumbers(plain)) return PASSWORD_NEEDS_MIX;
  return null;
}
