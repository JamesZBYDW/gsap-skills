import { describe, it, expect } from 'vitest';
import { clientIp } from './http';

const req = (headers: Record<string, string>) => new Request('https://portal.example/api/auth/login', { headers });

describe('clientIp', () => {
  it('prefers CF-Connecting-IP over a client-supplied X-Forwarded-For', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1, 203.0.113.7' }))).toBe(
      '203.0.113.7',
    );
  });

  it('falls back to the first X-Forwarded-For entry, then X-Real-IP', () => {
    expect(clientIp(req({ 'x-forwarded-for': '198.51.100.4, 10.0.0.2' }))).toBe('198.51.100.4');
    expect(clientIp(req({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
  });

  it('returns null when no proxy header is present', () => {
    expect(clientIp(req({}))).toBeNull();
  });
});
