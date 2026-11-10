import { describe, it, expect } from 'vitest';
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyError,
} from './password-policy';
import { passwordPolicyError as serverPolicyError } from './password-core';
import { createAccountSchema, credentialsSchema, firstPasswordSchema, passwordChangeSchema } from './validation';

const SEVEN = 'abcde12'; // letters + numbers, 7 chars
const EIGHT = 'abcde123'; // letters + numbers, 8 chars

describe('password policy (8-character minimum)', () => {
  it('is 8 to 200 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(200);
    expect(PASSWORD_HINT).toBe('At least 8 characters, with letters and numbers.');
  });

  it('rejects 7, accepts 8 (letters + numbers)', () => {
    expect(SEVEN).toHaveLength(7);
    expect(EIGHT).toHaveLength(8);
    expect(passwordPolicyError(SEVEN)).toMatch(/at least 8/);
    expect(passwordPolicyError(EIGHT)).toBeNull();
  });

  it('still requires both letters and numbers at the minimum length', () => {
    expect(passwordPolicyError('abcdefgh')).toMatch(/letters and numbers/);
    expect(passwordPolicyError('12345678')).toMatch(/letters and numbers/);
  });

  it('keeps the 200-character maximum', () => {
    expect(passwordPolicyError(`a1${'x'.repeat(198)}`)).toBeNull();
    expect(passwordPolicyError(`a1${'x'.repeat(199)}`)).toMatch(/at most 200/);
  });

  it('the server/CLI module uses the very same policy', () => {
    expect(serverPolicyError).toBe(passwordPolicyError);
  });
});

describe('every password schema enforces the same boundary', () => {
  const base = {
    name: 'Northwind Partners',
    email: 'nw@example.com',
    principal: '600,000',
    ratePercent: '15',
    termMonths: '24',
  };
  const cases: Array<[string, (pw: string) => { success: boolean }]> = [
    ['create account', (pw) => createAccountSchema.safeParse({ ...base, password: pw })],
    ['management credentials (issue/reset)', (pw) => credentialsSchema.safeParse({ password: pw })],
    ['forced first-login set', (pw) => firstPasswordSchema.safeParse({ newPassword: pw })],
    ['own password change', (pw) => passwordChangeSchema.safeParse({ currentPassword: 'old', newPassword: pw })],
  ];
  for (const [label, parse] of cases) {
    it(`${label}: 7 rejected, 8 accepted, composition and max kept`, () => {
      expect(parse(SEVEN).success).toBe(false);
      expect(parse(EIGHT).success).toBe(true);
      expect(parse('abcdefgh').success).toBe(false);
      expect(parse('12345678').success).toBe(false);
      expect(parse(`a1${'x'.repeat(199)}`).success).toBe(false);
    });
  }
});
