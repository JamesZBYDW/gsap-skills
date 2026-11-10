import { describe, it, expect } from 'vitest';
import { renderPortalEmail, type PortalEmailKind } from './templates';

const ORIGIN = 'https://portal.acgroupinc.com';
const TOKEN = 'Zm9vYmFy-_0123456789abcdefghijklmnopqrstuvw';
const KINDS: PortalEmailKind[] = ['invite', 'reset', 'payment', 'maturity'];
const render = (kind: PortalEmailKind) => renderPortalEmail(kind, ORIGIN, TOKEN);
/** Visible text of the HTML (tags, comments and the hidden preview removed). */
const visible = (html: string) =>
  html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<head>[\s\S]*?<\/head>/, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('renderPortalEmail', () => {
  it('keeps the four subjects', () => {
    expect(KINDS.map((k) => render(k).subject)).toEqual([
      'Your ACG Investor Portal invitation',
      'Reset your ACG portal password',
      'Distribution recorded in your ACG portal',
      'Your ACG note is approaching maturity',
    ]);
  });

  it.each(['invite', 'reset'] as const)('%s: carries the one-time set-password link in text, button and fallback', (kind) => {
    const link = `${ORIGIN}/set-password#token=${TOKEN}`;
    const { text, html } = render(kind);
    expect(text.split('\n')).toContain(link); // on its own line, unwrapped
    expect(html.match(new RegExp(`href="${link.replace(/[.#?]/g, '\\$&')}"`, 'g'))).toHaveLength(2);
    expect(visible(html)).toContain(link);
  });

  it('states the real expiry: invite 48 hours, reset 30 minutes, both single use', () => {
    for (const body of [render('invite').text, visible(render('invite').html)]) {
      expect(body).toMatch(/used once and expires 48 hours after it was issued/);
    }
    for (const body of [render('reset').text, visible(render('reset').html)]) {
      expect(body).toMatch(/used once and expires 30 minutes after it was requested/);
      expect(body).toMatch(/did not request a password reset, you can ignore this email/);
    }
  });

  it.each(['payment', 'maturity'] as const)('%s: links to sign-in only and discloses no token, amount or date', (kind) => {
    const { text, html } = render(kind);
    const link = `${ORIGIN}/portal/overview`;
    expect(text.split('\n')).toContain(link);
    expect(html).toContain(`href="${link}"`);
    for (const body of [text, html]) {
      expect(body).not.toContain(TOKEN);
      expect(body).not.toContain('set-password');
    }
    for (const body of [text, visible(html)]) {
      expect(body).not.toMatch(/\$|USD|%|\b(19|20)\d\d\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d/);
      expect(body).not.toMatch(/guarantee/i);
      expect(body).toMatch(/does not include amounts, dates or account details/);
    }
  });

  it('maturity mentions only the 90-day window', () => {
    expect(render('maturity').text).toMatch(/within 90 days of its maturity date/);
  });

  it.each(KINDS)('%s: HTML is self-contained, email-safe and compact', (kind) => {
    const { html } = render(kind);
    expect(html.length).toBeLessThan(8_000);
    expect(html).not.toMatch(/<script|<link|<style|@import|@font-face|url\(|<iframe|<form|javascript:|\son\w+=/i);
    // Every address in the message is on the portal's own origin.
    for (const url of html.match(/https?:\/\/[^\s"'<>]+/g) ?? []) expect(url.startsWith(ORIGIN)).toBe(true);
    // One image: the portal logo, no identifiers, sized, with alt text styled for when images are blocked.
    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images).toHaveLength(1);
    expect(images[0]).toContain(`src="${ORIGIN}/acg-logo-cream.png"`);
    expect(images[0]).toMatch(/alt="ACG"/);
    expect(images[0]).toMatch(/width="104" height="51"/);
    // Layout tables are marked as presentation; the document declares its language.
    for (const t of html.match(/<table[^>]*>/g) ?? []) expect(t).toContain('role="presentation"');
    expect(html).toMatch(/^<!doctype html>\n<html lang="en">/);
    // The name is real text, so it shows with images off.
    expect(visible(html)).toContain('AMSTERDAM CAPITAL GROUP');
  });

  it('the logo request is identical for every recipient and message (no tracking)', () => {
    const src = (html: string) => /<img src="([^"]+)"/.exec(html)![1];
    const all = KINDS.flatMap((k) => [renderPortalEmail(k, ORIGIN, 'token-a').html, renderPortalEmail(k, ORIGIN, 'token-b').html]).map(src);
    expect(new Set(all).size).toBe(1);
    expect(all[0]).not.toMatch(/[?#]/);
  });

  it.each(KINDS)('%s: plain text says the same thing as the HTML', (kind) => {
    const { text, html } = render(kind);
    expect(text).not.toMatch(/<[a-z!/]/i);
    const seen = visible(html);
    for (const line of text.split('\n').filter((l) => l.length > 40 && !l.startsWith('http'))) {
      expect(seen).toContain(line.replace(/“|”/g, (q) => q));
    }
    expect(text).toMatch(/^AMSTERDAM CAPITAL GROUP\nInvestor Relations\n/);
    expect(text.trimEnd().split('\n').at(-2)).toBe('Amsterdam Capital Group · Investor Relations');
  });

  it('escapes anything interpolated into the HTML', () => {
    const { html } = renderPortalEmail('invite', ORIGIN, 'a"><b>&x');
    expect(html).not.toContain('"><b>');
    expect(html).toContain('a&quot;&gt;&lt;b&gt;&amp;x');
  });
});
