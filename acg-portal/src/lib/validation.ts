import { z } from 'zod';
import { MIN_PRINCIPAL_CENTS, MAX_PRINCIPAL_CENTS, isSupportedTerm } from './rates';
import { parseMoneyToCents } from './money';

export const RoleEnum = z.enum(['INVESTOR', 'TEAM']);

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email.').max(320),
  password: z.string().min(1, 'Enter your password.').max(200),
  role: RoleEnum,
});

// Free-text money from a form, validated + transformed to integer cents.
// Empty -> null (allowed). Non-empty must parse and fall within [min, max].
// NOTE: after parsing, the field VALUE is cents (number | null), not the raw string.
const principalCentsField = z
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
    if (cents < MIN_PRINCIPAL_CENTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum investment is $100,000.' });
      return z.NEVER;
    }
    if (cents > MAX_PRINCIPAL_CENTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount exceeds the supported maximum.' });
      return z.NEVER;
    }
    return cents;
  });

// Only the four published, counsel-approved terms are accepted.
const termMonthsField = z.coerce
  .number()
  .int()
  .refine(isSupportedTerm, { message: 'Unsupported term. Choose 12, 18, 24, or 36 months.' });

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full legal name or entity.').max(200),
  email: z.string().email('Enter a valid email.').max(320),
  type: z.enum(['INDIVIDUAL', 'ENTITY']),
  principal: principalCentsField, // value becomes cents (number | null)
  termMonths: termMonthsField,
  acknowledgedAccredited: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm you are an accredited investor.' }),
  }),
});

export const requestTypeEnum = z.enum([
  'ADD_CAPITAL',
  'UPDATE_BANKING',
  'MATURITY_ELECTION',
  'DOCUMENT',
  'UPDATE_PROFILE',
  'NOTIF_PREFS',
  'GENERAL',
]);

export const requestCreateSchema = z.object({
  type: requestTypeEnum,
  detail: z.string().trim().max(2000).optional().default(''),
});

export const messageSchema = z.object({
  text: z.string().trim().min(1, 'Write a message.').max(4000),
});

export const broadcastSchema = z.object({
  text: z.string().trim().min(1, 'Write a message.').max(4000),
});

export const addInvestorSchema = z.object({
  name: z.string().trim().min(2, 'Enter a legal name or entity.').max(200),
  email: z.string().email().max(320).optional(),
  type: z.enum(['INDIVIDUAL', 'ENTITY']).default('INDIVIDUAL'),
  principal: principalCentsField, // value becomes cents (number | null)
  termMonths: termMonthsField,
});

export const reviewStatusSchema = z.object({
  status: z.enum(['APPROVED', 'COMPLETED', 'NEEDS_INFO', 'DECLINED', 'IN_REVIEW']),
});

export const notifPrefSchema = z.object({
  key: z.enum(['distributionPosted', 'maturityReminder', 'newMessage']),
  value: z.boolean(),
});

export const impersonateSchema = z.object({
  investorId: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
