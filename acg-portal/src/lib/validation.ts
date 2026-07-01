import { z } from 'zod';
import { MIN_PRINCIPAL_CENTS, MAX_PRINCIPAL_CENTS, isSupportedTerm } from './rates';
import { parseMoneyToCents } from './money';

export const RoleEnum = z.enum(['INVESTOR', 'TEAM']);

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email.').max(320),
  password: z.string().min(1, 'Enter your password.').max(200),
  role: RoleEnum,
});

// Free-text money -> integer cents. Empty -> null. Non-empty must parse and be
// within [min,max]. After parsing, the field VALUE is cents (number | null).
function moneyCents(opts: { min?: number; minMsg?: string; max?: number }) {
  return z
    .string()
    .max(40)
    .optional()
    .default('')
    .transform((raw, ctx) => {
      const t = (raw ?? '').trim();
      if (!t) return null;
      const cents = parseMoneyToCents(t);
      if (cents === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid amount, e.g. 250,000.' });
        return z.NEVER;
      }
      if (opts.min != null && cents < opts.min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: opts.minMsg ?? 'Amount is below the minimum.' });
        return z.NEVER;
      }
      if (opts.max != null && cents > opts.max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount exceeds the supported maximum.' });
        return z.NEVER;
      }
      return cents;
    });
}

const principalCentsField = moneyCents({
  min: MIN_PRINCIPAL_CENTS,
  minMsg: 'Minimum investment is $100,000.',
  max: MAX_PRINCIPAL_CENTS,
});
// A published, counsel-approved term (12/18/24/36 months → 1 / 1.5 / 2 / 3 years).
const termMonthsField = z.coerce
  .number()
  .int()
  .refine(isSupportedTerm, { message: 'Choose a 1, 1.5, 2, or 3 year term.' });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length ? v : null));

const passwordField = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .max(200)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), {
    message: 'Password must include both letters and numbers.',
  });

// Management sets the note terms; drives the investor's schedule. Everything
// else is DERIVED server-side: amount = principal × rate ÷ 12, first
// distribution = wire + 30 days, maturity = wire + term, and status flips to
// Active once the wire-received date is set (Expired after the final,
// principal-bearing distribution).
export const noteTermsSchema = z.object({
  principal: principalCentsField,
  ratePercent: z.coerce.number().min(0, 'Rate cannot be negative.').max(100, 'Rate looks too high.'),
  termMonths: termMonthsField,
  wireReceivedDate: isoDate,
});

// Management provisions or resets an investor login.
export const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email.').max(320).optional(),
  password: passwordField,
  mustChange: z.boolean().optional().default(true),
});

// Management creates an entire investor account in one step: identity details,
// note terms, and the sign-in credentials the investor will use.
export const createAccountSchema = z.object({
  name: z.string().trim().min(2, 'Enter a legal name or entity.').max(200),
  email: z.string().email('Enter a valid email.').max(320),
  type: z.enum(['INDIVIDUAL', 'ENTITY']).default('INDIVIDUAL'),
  // Login credentials (email defaults to the contact email when omitted).
  loginEmail: z.string().email('Enter a valid login email.').max(320).optional(),
  password: passwordField,
  mustChange: z.boolean().optional().default(true),
  // Note terms (amount, first distribution, maturity, and status are derived
  // server-side from these + the wire-received date).
  principal: principalCentsField,
  ratePercent: z.coerce.number().min(0, 'Rate cannot be negative.').max(100, 'Rate looks too high.'),
  termMonths: termMonthsField.default(24),
  wireReceivedDate: isoDate,
});

// Investor changes their own password (from Profile).
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordField,
});

// Forced first-login password set (no current password — the session proves it).
export const firstPasswordSchema = z.object({
  newPassword: passwordField,
});

export const notifPrefSchema = z.object({
  key: z.enum(['distributionPosted', 'maturityReminder']),
  value: z.boolean(),
});

export const impersonateSchema = z.object({
  investorId: z.string().min(1),
});

export type NoteTermsInput = z.infer<typeof noteTermsSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
