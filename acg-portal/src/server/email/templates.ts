// Outgoing portal email: one institutional letterhead layout, four messages.
//
// Email-safe by construction: presentation tables, inline styles only, system
// fonts, no scripts, no remote fonts and no tracking. The only image is the
// portal's own logo (the same file for every recipient, no identifiers), and
// the layout reads correctly with images blocked. Amounts, dates and account
// details are never included; they stay behind sign-in.

export type PortalEmailKind = 'invite' | 'reset' | 'payment' | 'maturity';

export interface PortalEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  /** Inbox preview line. */
  preview: string;
  eyebrow: string;
  heading: string;
  body: string[];
  action: string;
  /** Shown in the bordered note under the button. */
  note: string;
  /** Closing line of the letter. */
  closing?: string;
  /** Why the recipient is getting this (footer). */
  reason: string;
}

const COPY: Record<PortalEmailKind, Copy> = {
  invite: {
    subject: 'Your ACG Investor Portal invitation',
    preview: 'Set your password to open your ACG Investor Portal account.',
    eyebrow: 'Account invitation',
    heading: 'Welcome to the ACG Investor Portal',
    body: [
      'Investor Relations has created your portal account. To finish setting it up, choose your password using the private link below.',
    ],
    action: 'Set your password',
    note: 'This link is personal to you. It can be used once and expires 48 hours after it was issued. If it expires, ask Investor Relations for a new invitation.',
    closing: 'If you were not expecting this invitation, you can disregard this email.',
    reason: 'You are receiving this email because Investor Relations created a portal account for this address.',
  },
  reset: {
    subject: 'Reset your ACG portal password',
    preview: 'Use your private link to choose a new portal password.',
    eyebrow: 'Password reset',
    heading: 'Choose a new password',
    body: [
      'We received a request to reset the password for your ACG Investor Portal account. Use the private link below to choose a new one.',
    ],
    action: 'Choose a new password',
    note: 'This link can be used once and expires 30 minutes after it was requested. If it expires, request a new one from the portal sign-in page.',
    closing: 'If you did not request a password reset, you can ignore this email. Your password stays the same unless this link is used.',
    reason: 'You are receiving this email because a password reset was requested for this address.',
  },
  payment: {
    subject: 'Distribution recorded in your ACG portal',
    preview: 'A distribution has been recorded on your note. Sign in to review it.',
    eyebrow: 'Distribution notice',
    heading: 'A distribution has been recorded',
    body: ['Investor Relations has recorded a distribution on your note. Sign in to your portal to review it.'],
    action: 'Sign in to review',
    note: 'For your privacy, this email does not include amounts, dates or account details. They are shown only after you sign in.',
    reason:
      'You are receiving this notice because “Distribution posted” is turned on in your portal profile. You can change this under Profile, Notifications.',
  },
  maturity: {
    subject: 'Your ACG note is approaching maturity',
    preview: 'Your note is within 90 days of its maturity date.',
    eyebrow: 'Maturity notice',
    heading: 'Your note is approaching maturity',
    body: [
      'Your note is within 90 days of its maturity date. Sign in to your portal to review your schedule, and contact Investor Relations with any questions.',
    ],
    action: 'Review your schedule',
    note: 'For your privacy, this email does not include amounts, dates or account details. They are shown only after you sign in.',
    reason:
      'You are receiving this notice because “Maturity reminders” is turned on in your portal profile. You can change this under Profile, Notifications.',
  },
};

// ACG palette (src/app/globals.css). Gold text uses a darker tone for contrast.
const NAVY = '#0b1d3a';
const IVORY = '#faf7f0';
const CREAM = '#f4f1ea';
const GOLD = '#a87e45';
const GOLD_SOFT = '#c8a878';
const GOLD_TEXT = '#8a6431';
const INK = '#0c1f3d';
const BODY = '#3a4558';
const MUTED = '#667085';
const LINE = '#e4ded1';
const SANS = 'Arial,Helvetica,sans-serif';
const SERIF = "Georgia,'Times New Roman',serif";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function actionUrl(kind: PortalEmailKind, origin: string, token: string): string {
  return kind === 'invite' || kind === 'reset' ? `${origin}/set-password#token=${token}` : `${origin}/portal/overview`;
}

function renderText(c: Copy, url: string): string {
  return [
    'AMSTERDAM CAPITAL GROUP',
    'Investor Relations',
    '',
    c.heading,
    '',
    ...c.body.flatMap((p) => [p, '']),
    `${c.action}:`,
    url,
    '',
    c.note,
    ...(c.closing ? ['', c.closing] : []),
    '',
    '--',
    'Amsterdam Capital Group · Investor Relations',
    c.reason,
  ].join('\n');
}

function renderHtml(c: Copy, url: string, origin: string): string {
  const href = esc(url);
  const table = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
  const p = (text: string, style: string) => `<p style="margin:0 0 18px;font:16px/1.6 ${SANS};color:${BODY};${style}">${esc(text)}</p>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${CREAM};">${esc(c.preview)}</div>
<table ${table} width="100%" bgcolor="${CREAM}" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table ${table} width="600" align="center"><tr><td><![endif]-->
<table ${table} width="100%" style="max-width:600px;">
<tr><td align="center" bgcolor="${NAVY}" style="padding:30px 24px 26px;background:${NAVY};border-radius:10px 10px 0 0;">
<img src="${esc(origin)}/acg-logo-cream.png" width="104" height="51" alt="ACG" style="display:block;margin:0 auto;border:0;font:italic 32px ${SERIF};color:#f3ecdc;">
<div style="margin-top:14px;font:bold 11px/1.4 ${SANS};letter-spacing:3px;color:${GOLD_SOFT};">AMSTERDAM CAPITAL GROUP</div>
<div style="margin-top:5px;font:11px/1.4 ${SANS};letter-spacing:1.5px;color:#9fb0cc;">INVESTOR RELATIONS</div>
</td></tr>
<tr><td bgcolor="${GOLD}" height="3" style="height:3px;line-height:3px;font-size:0;background:${GOLD};">&nbsp;</td></tr>
<tr><td bgcolor="#ffffff" style="padding:38px 28px 30px;background:#ffffff;border-left:1px solid ${LINE};border-right:1px solid ${LINE};">
<div style="font:bold 11px/1.4 ${SANS};letter-spacing:2px;text-transform:uppercase;color:${GOLD_TEXT};">${esc(c.eyebrow)}</div>
<h1 style="margin:10px 0 20px;font:normal 26px/1.25 ${SERIF};color:${INK};">${esc(c.heading)}</h1>
${c.body.map((t) => p(t, '')).join('\n')}
<table ${table} style="margin:26px 0 28px;"><tr><td align="center" bgcolor="${NAVY}" style="background:${NAVY};border-radius:6px;">
<a href="${href}" style="display:inline-block;padding:15px 30px;font:bold 16px/1.2 ${SANS};color:${IVORY};text-decoration:none;border-radius:6px;">${esc(c.action)}</a>
</td></tr></table>
<table ${table} width="100%"><tr><td bgcolor="${IVORY}" style="padding:16px 18px;background:${IVORY};border-left:3px solid ${GOLD};font:14px/1.6 ${SANS};color:${BODY};">${esc(c.note)}</td></tr></table>
${c.closing ? p(c.closing, 'margin:22px 0 0;font-size:15px;') : ''}
<p style="margin:26px 0 0;padding-top:18px;border-top:1px solid ${LINE};font:13px/1.6 ${SANS};color:${MUTED};">If the button does not work, copy this address into your browser:<br><a href="${href}" style="color:${INK};text-decoration:underline;word-break:break-all;">${href}</a></p>
</td></tr>
<tr><td bgcolor="${IVORY}" style="padding:22px 28px 24px;background:${IVORY};border:1px solid ${LINE};border-radius:0 0 10px 10px;">
<div style="font:bold 13px/1.5 ${SANS};color:${INK};">Amsterdam Capital Group · Investor Relations</div>
<div style="margin-top:6px;font:12px/1.6 ${SANS};color:${MUTED};">${esc(c.reason)}</div>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Subject, plain text and HTML for one portal email. `origin` is the portal's
 * HTTPS origin; `token` is the one-time account-link token for invite/reset
 * and is ignored for the notices.
 */
export function renderPortalEmail(kind: PortalEmailKind, origin: string, token: string): PortalEmail {
  const c = COPY[kind];
  const url = actionUrl(kind, origin, token);
  return { subject: c.subject, text: renderText(c, url), html: renderHtml(c, url, origin) };
}
