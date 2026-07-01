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
      expect(r.data.termMonths).toBe(24);
    }
  });
  it('rejects an unsupported term', () => {
    expect(createAccountSchema.safeParse({ ...baseCreate, termMonths: '13' }).success).toBe(false);
    expect(createAccountSchema.safeParse({ ...baseCreate, termMonths: '18' }).success).toBe(true);
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
  const base = { ratePercent: '18', status: 'ACTIVE', termMonths: '24', wireReceivedDate: '2026-06-01', firstDistributionDate: '2026-07-01' };
  it('transforms principal to cents; keeps ratePercent numeric; coerces the term', () => {
    const r = noteTermsSchema.safeParse({ ...base, principal: '250,000' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.principal).toBe(25_000_000);
      expect(r.data.ratePercent).toBe(18);
      expect(r.data.termMonths).toBe(24);
    }
  });
  it('accepts each published term (1 / 1.5 / 2 / 3 years) and rejects others', () => {
    for (const t of ['12', '18', '24', '36']) {
      expect(noteTermsSchema.safeParse({ ...base, termMonths: t, principal: '250,000' }).success).toBe(true);
    }
    expect(noteTermsSchema.safeParse({ ...base, termMonths: '30', principal: '250,000' }).success).toBe(false);
  });
  it('leaves dates optional (blank → null) for an Awaiting shell', () => {
    const r = noteTermsSchema.safeParse({ ratePercent: '0', status: 'AWAITING', termMonths: '12', principal: '' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.wireReceivedDate).toBeNull();
      expect(r.data.firstDistributionDate).toBeNull();
    }
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
