import { describe, it, expect } from 'vitest';
import { canonicalHttpsRedirect } from './canonical';

const APP = 'https://portal.acgroupinc.com';

describe('canonicalHttpsRedirect', () => {
  it('308-redirects plain HTTP on the canonical host to HTTPS, keeping path and query', () => {
    const res = canonicalHttpsRedirect(new Request('http://portal.acgroupinc.com/login?next=%2Fportal'), APP)!;
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://portal.acgroupinc.com/login?next=%2Fportal');
  });

  it('passes HTTPS and other hosts through', () => {
    expect(canonicalHttpsRedirect(new Request('https://portal.acgroupinc.com/login'), APP)).toBeNull();
    expect(canonicalHttpsRedirect(new Request('http://localhost:8787/login'), APP)).toBeNull();
    expect(canonicalHttpsRedirect(new Request('http://acgroupinc.com/'), APP)).toBeNull();
  });

  it('does nothing without a valid APP_URL', () => {
    expect(canonicalHttpsRedirect(new Request('http://portal.acgroupinc.com/'), undefined)).toBeNull();
    expect(canonicalHttpsRedirect(new Request('http://portal.acgroupinc.com/'), 'not a url')).toBeNull();
  });
});
