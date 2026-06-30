import { describe, it, expect } from 'vitest';
import { registerSchema, addInvestorSchema } from './validation';

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
  it('addInvestorSchema applies the same rules', () => {
    expect(addInvestorSchema.safeParse({ name: 'Acme LLC', termMonths: 24, principal: '500,000' }).success).toBe(true);
    expect(addInvestorSchema.safeParse({ name: 'Acme LLC', termMonths: 99, principal: '500,000' }).success).toBe(false);
    expect(addInvestorSchema.safeParse({ name: 'Acme LLC', termMonths: 24, principal: '5' }).success).toBe(false);
  });
});
