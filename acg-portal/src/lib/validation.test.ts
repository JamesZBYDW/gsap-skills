import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  addInvestorSchema,
  noteTermsSchema,
  credentialsSchema,
  passwordChangeSchema,
} from './validation';

const baseReg = {
  name: 'Sofia Marenco',
  email: 'sofia@example.com',
  type: 'INDIVIDUAL' as const,
  acknowledgedAccredited: true as const,
};

describe('registerSchema — term enforcement', () => {
  it('accepts the four published terms and rejects others', () => {
    for (const t of [12, 18, 24, 36]) {
      expect(registerSchema.safeParse({ ...baseReg, principal: '250,000', termMonths: t }).success).toBe(true);
    }
    for (const t of [13, 60, 120, 1]) {
      expect(registerSchema.safeParse({ ...baseReg, principal: '250,000', termMonths: t }).success).toBe(false);
    }
  });
});

describe('principal validation/transform', () => {
  it('transforms a valid principal to cents', () => {
    const r = registerSchema.safeParse({ ...baseReg, principal: '250,000', termMonths: 24 });
    expect(r.success && r.data.principal).toBe(25_000_000);
  });
  it('treats blank as null (allowed)', () => {
    const r = registerSchema.safeParse({ ...baseReg, principal: '', termMonths: 24 });
    expect(r.success && r.data.principal).toBeNull();
  });
  it('rejects below the $100,000 minimum', () => {
    expect(registerSchema.safeParse({ ...baseReg, principal: '1', termMonths: 24 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...baseReg, principal: '99,999', termMonths: 24 }).success).toBe(false);
  });
  it('rejects unparseable amounts instead of silently becoming $0', () => {
    expect(registerSchema.safeParse({ ...baseReg, principal: 'two hundred thousand', termMonths: 24 }).success).toBe(false);
    expect(registerSchema.safeParse({ ...baseReg, principal: '-50000', termMonths: 24 }).success).toBe(false);
  });
  it('rejects amounts above the supported maximum (Int-overflow guard)', () => {
    expect(registerSchema.safeParse({ ...baseReg, principal: '25,000,000', termMonths: 24 }).success).toBe(false);
  });
});

describe('addInvestorSchema (shell only)', () => {
  it('requires name + email; defaults type', () => {
    const r = addInvestorSchema.safeParse({ name: 'Acme LLC', email: 'ops@acme.com' });
    expect(r.success && r.data.type).toBe('INDIVIDUAL');
  });
  it('rejects a missing/invalid email', () => {
    expect(addInvestorSchema.safeParse({ name: 'Acme LLC' }).success).toBe(false);
    expect(addInvestorSchema.safeParse({ name: 'Acme LLC', email: 'nope' }).success).toBe(false);
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
});
