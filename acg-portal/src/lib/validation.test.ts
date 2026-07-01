import { describe, it, expect } from 'vitest';
import {
  createAccountSchema,
  noteTermsSchema,
  credentialsSchema,
  passwordChangeSchema,
  firstPasswordSchema,
} from './validation';

const baseCreate = {
  name: 'Acme LLC',
  email: 'ops@acme.com',
  password: 'Sunrise2026x',
  ratePercent: '18',
};

describe('createAccountSchema', () => {
  it('accepts the minimum fields and applies defaults', () => {
    const r = createAccountSchema.safeParse(baseCreate);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe('INDIVIDUAL');
      expect(r.data.status).toBe('AWAITING');
      expect(r.data.mustChange).toBe(true);
      expect(r.data.distributionDay).toBe(1);
    }
  });
  it('requires a valid contact email and a strong password', () => {
    expect(createAccountSchema.safeParse({ ...baseCreate, email: 'nope' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...baseCreate, password: 'short1' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...baseCreate, password: 'alllettersonly' }).success).toBe(false);
  });
});

describe('principal validation/transform (create account)', () => {
  it('transforms a valid principal to cents', () => {
    const r = createAccountSchema.safeParse({ ...baseCreate, principal: '250,000' });
    expect(r.success && r.data.principal).toBe(25_000_000);
  });
  it('treats blank as null (allowed)', () => {
    const r = createAccountSchema.safeParse({ ...baseCreate, principal: '' });
    expect(r.success && r.data.principal).toBeNull();
  });
  it('rejects below the $100,000 minimum', () => {
    expect(createAccountSchema.safeParse({ ...baseCreate, principal: '1' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...baseCreate, principal: '99,999' }).success).toBe(false);
  });
  it('rejects unparseable amounts instead of silently becoming $0', () => {
    expect(createAccountSchema.safeParse({ ...baseCreate, principal: 'two hundred thousand' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...baseCreate, principal: '-50000' }).success).toBe(false);
  });
  it('rejects amounts above the supported maximum (Int-overflow guard)', () => {
    expect(createAccountSchema.safeParse({ ...baseCreate, principal: '25,000,000' }).success).toBe(false);
  });
});

describe('noteTermsSchema', () => {
  const base = { ratePercent: '18', status: 'ACTIVE', distributionDay: '1', firstDistributionDate: '2026-08-01', maturityDate: '2028-08-01' };
  it('transforms principal + amount to cents; keeps ratePercent numeric', () => {
    const r = noteTermsSchema.safeParse({ ...base, principal: '250,000', distributionAmount: '3,750' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.principal).toBe(25_000_000);
      expect(r.data.distributionAmount).toBe(375_000);
      expect(r.data.ratePercent).toBe(18);
    }
  });
  it('allows a small distribution amount (no $100k minimum)', () => {
    expect(noteTermsSchema.safeParse({ ...base, principal: '250,000', distributionAmount: '500' }).success).toBe(true);
  });
  it('bounds the recurring day to 1–28', () => {
    expect(noteTermsSchema.safeParse({ ...base, distributionDay: '31', principal: '250,000', distributionAmount: '3,750' }).success).toBe(false);
  });
});

describe('credentials + password policy', () => {
  it('accepts a strong password, rejects weak ones', () => {
    expect(credentialsSchema.safeParse({ password: 'Sunrise2026x' }).success).toBe(true);
    expect(credentialsSchema.safeParse({ password: 'short1' }).success).toBe(false);
    expect(credentialsSchema.safeParse({ password: 'alllettersonly' }).success).toBe(false);
  });
  it('password change requires current + strong new', () => {
    expect(passwordChangeSchema.safeParse({ currentPassword: 'x', newPassword: 'Sunrise2026x' }).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ currentPassword: '', newPassword: 'Sunrise2026x' }).success).toBe(false);
  });
  it('forced first-login set requires only a strong new password', () => {
    expect(firstPasswordSchema.safeParse({ newPassword: 'Sunrise2026x' }).success).toBe(true);
    expect(firstPasswordSchema.safeParse({ newPassword: 'weak' }).success).toBe(false);
  });
});
