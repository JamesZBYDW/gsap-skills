'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import { TERM_OPTIONS } from '@/lib/rates';
import { computeDistributionDollars, addMonthsISO, addDaysISO, formatISOToLong } from '@/lib/noteterms';

type AccountType = 'INDIVIDUAL' | 'ENTITY';

// One screen where management inputs everything to stand up an investor account:
// identity details, note terms, and the sign-in credentials the investor uses.
export function CreateAccountView() {
  const router = useRouter();
  const { toast } = useToast();

  // Details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<AccountType>('INDIVIDUAL');

  // Note terms
  const [principal, setPrincipal] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [termMonths, setTermMonths] = useState(24);
  const [wireDate, setWireDate] = useState('');

  // Login credentials (login email defaults to the contact email until edited).
  const [loginEmail, setLoginEmail] = useState('');
  const [loginTouched, setLoginTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);

  const [busy, setBusy] = useState(false);

  const effectiveLoginEmail = loginTouched ? loginEmail : email;
  const distributionAmount = computeDistributionDollars(principal, ratePercent);
  const firstISO = addDaysISO(wireDate, 30);
  const maturityISO = addMonthsISO(wireDate, termMonths);
  const autoStatus = wireDate ? 'Active' : 'Awaiting wire';

  function onEmailChange(v: string) {
    setEmail(v);
    if (!loginTouched) setLoginEmail(v);
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 14; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p + '2a');
  }

  const canSubmit = name.trim().length >= 2 && email.includes('@') && password.length >= 10 && !busy;

  async function submit() {
    setBusy(true);
    try {
      await api.post<{ investorId: string }>('/api/team/accounts', {
        name,
        email,
        phone,
        type,
        loginEmail: effectiveLoginEmail || undefined,
        password,
        mustChange,
        principal,
        ratePercent: ratePercent || '0',
        termMonths,
        wireReceivedDate: wireDate || null,
      });
      toast(`Account created — share ${effectiveLoginEmail} + password with ${name}`);
      router.push('/console/investors');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not create account');
      setBusy(false);
    }
  }

  return (
    <div className="content" style={{ paddingTop: 22, maxWidth: 760 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* DETAILS */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="tileEyebrow">INVESTOR DETAILS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 14 }}>
            <Field label="LEGAL NAME">
              <input className="fieldLight" data-testid="ca-name" placeholder="Full legal name or entity" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="CONTACT EMAIL">
                <input className="fieldLight" data-testid="ca-email" placeholder="investor@example.com" value={email} onChange={(e) => onEmailChange(e.target.value)} />
              </Field>
              <Field label="PHONE">
                <input className="fieldLight" data-testid="ca-phone" placeholder="(212) 555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <Field label="ACCOUNT TYPE">
              <div className="segment" style={{ borderRadius: 9 }}>
                <div data-testid="ca-type-individual" className={`segmentItem${type === 'INDIVIDUAL' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem', color: type === 'INDIVIDUAL' ? '#0b1d3a' : '#5b6473' }} onClick={() => setType('INDIVIDUAL')}>Individual</div>
                <div data-testid="ca-type-entity" className={`segmentItem${type === 'ENTITY' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem', color: type === 'ENTITY' ? '#0b1d3a' : '#5b6473' }} onClick={() => setType('ENTITY')}>Entity</div>
              </div>
            </Field>
          </div>
        </div>

        {/* NOTE TERMS */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="tileEyebrow">NOTE TERMS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="PRINCIPAL"><input className="fieldLight" data-testid="ca-principal" placeholder="250,000" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></Field>
              <Field label="FIXED RATE %"><input className="fieldLight" data-testid="ca-rate" placeholder="18" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="TERM">
                <select className="fieldLight" data-testid="ca-term" value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value))}>
                  {TERM_OPTIONS.map((t) => (
                    <option key={t.months} value={t.months}>{t.yearsLabel}</option>
                  ))}
                </select>
              </Field>
              <Field label="DISTRIBUTION AMOUNT (AUTO)">
                <input className="fieldLight" data-testid="ca-amount" value={distributionAmount ? `$${distributionAmount}` : '—'} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="WIRE RECEIVED"><input className="fieldLight" data-testid="ca-wire" type="date" value={wireDate} onChange={(e) => setWireDate(e.target.value)} /></Field>
              <Field label="FIRST DISTRIBUTION (AUTO)">
                <input className="fieldLight" data-testid="ca-first" value={firstISO ? formatISOToLong(firstISO) : '—'} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="MATURITY (AUTO)">
                <input className="fieldLight" data-testid="ca-maturity" value={maturityISO ? formatISOToLong(maturityISO) : '—'} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} />
              </Field>
              <Field label="STATUS (AUTO)">
                <input className="fieldLight" data-testid="ca-status" value={autoStatus} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} />
              </Field>
            </div>
            <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
              Everything derives from the wire-received date: the note goes Active when it&apos;s set, the first distribution lands 30 days later, distributions recur every 30 days, the final one returns the principal, and the note expires after it. Amount = principal × rate ÷ 12; maturity = wire date + term. Leave the wire date blank to create the account as Awaiting.
            </div>
          </div>
        </div>

        {/* LOGIN */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="tileEyebrow">INVESTOR LOGIN</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
            <Field label="LOGIN EMAIL">
              <input className="fieldLight" data-testid="ca-login-email" placeholder="defaults to contact email" value={effectiveLoginEmail} onChange={(e) => { setLoginTouched(true); setLoginEmail(e.target.value); }} />
            </Field>
            <Field label="INITIAL PASSWORD">
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="fieldLight" data-testid="ca-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Set or generate" />
                <button className="btnNeutral" style={{ padding: '0 14px', whiteSpace: 'nowrap' }} onClick={generatePassword} type="button">Generate</button>
              </div>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.8rem', color: '#5b6473', cursor: 'pointer' }}>
              <input type="checkbox" data-testid="ca-mustchange" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
              Require the investor to set their own password on first sign-in
            </label>
            <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
              At least 10 characters, letters + numbers. Share the login email + password with the investor securely.
            </div>
          </div>
        </div>

        <button className="btnPrimary" data-testid="ca-submit" style={{ alignSelf: 'flex-start', padding: '12px 24px', fontSize: '.9rem', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }} onClick={submit} disabled={!canSubmit}>
          <Icon name="user-plus" size={16} strokeWidth={2.2} />
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1 }}>
      <div className="fieldLabelGold">{label}</div>
      {children}
    </div>
  );
}
