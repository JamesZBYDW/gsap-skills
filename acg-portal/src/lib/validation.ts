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
// Per-distribution amount — no $100k minimum.
const amountCentsField = moneyCents({ min: 1, minMsg: 'Enter a distribution amount.', max: MAX_PRINCIPAL_CENTS });

// Only the four published, counsel-approved terms are accepted (public form).
const termMonthsField = z.coerce
  .number()
  .int()
  .refine(isSupportedTerm, { message: 'Unsupported term. Choose 12, 18, 24, or 36 months.' });

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

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full legal name or entity.').max(200),
  email: z.string().email('Enter a valid email.').max(320),
  type: z.enum(['INDIVIDUAL', 'ENTITY']),
  principal: principalCentsField,
  termMonths: termMonthsField,
  acknowledgedAccredited: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm you are an accredited investor.' }),
  }),
});

export const messageSchema = z.object({
  text: z.string().trim().min(1, 'Write a message.').max(4000),
});

export const broadcastSchema = z.object({
  text: z.string().trim().min(1, 'Write a message.').max(4000),
});

// Management creates the investor shell; note terms are set separately.
export const addInvestorSchema = z.object({
  name: z.string().trim().min(2, 'Enter a legal name or entity.').max(200),
  email: z.string().email('Enter a valid email.').max(320),
  type: z.enum(['INDIVIDUAL', 'ENTITY']).default('INDIVIDUAL'),
});

// Management sets the note terms; drives the investor's schedule.
export const noteTermsSchema = z.object({
  principal: principalCentsField,
  ratePercent: z.coerce.number().min(0, 'Rate cannot be negative.').max(100, 'Rate looks too high.'),
  status: z.enum(['AWAITING', 'ACTIVE', 'DECLINED']),
  firstDistributionDate: isoDate,
  distributionDay: z.coerce.number().int().min(1, 'Day 1–28.').max(28, 'Day 1–28.'),
  distributionAmount: amountCentsField,
  maturityDate: isoDate,
});

// Management provisions or resets an investor login.
export const credentialsSchema = z.object({
  email: z.string().email('Enter a valid email.').max(320).optional(),
  password: passwordField,
  mustChange: z.boolean().optional().default(true),
});

// Investor changes their own password.
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: passwordField,
});

export const notifPrefSchema = z.object({
  key: z.enum(['distributionPosted', 'maturityReminder', 'newMessage']),
  value: z.boolean(),
});

export const impersonateSchema = z.object({
  investorId: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type NoteTermsInput = z.infer<typeof noteTermsSchema>;
