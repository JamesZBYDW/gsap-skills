import { z } from 'zod';

export const RoleEnum = z.enum(['INVESTOR', 'TEAM']);

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email.').max(320),
  password: z.string().min(1, 'Enter your password.').max(200),
  role: RoleEnum,
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full legal name or entity.').max(200),
  email: z.string().email('Enter a valid email.').max(320),
  type: z.enum(['INDIVIDUAL', 'ENTITY']),
  // Free-text principal/term from the public form; parsed + validated server-side.
  principal: z.string().max(40).optional().default(''),
  termMonths: z.coerce.number().int().positive().max(120),
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
  principal: z.string().max(40).optional().default(''),
  termMonths: z.coerce.number().int().positive().max(120),
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
