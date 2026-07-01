'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

type AccountType = 'INDIVIDUAL' | 'ENTITY';

// One screen where management inputs everything to stand up an investor account:
// identity details, note terms, and the sign-in credentials the investor uses.
export function CreateAccountView() {
  const router = useRouter();
  const { toast } = useToast();

  // Details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [type, setType] = useState<AccountType>('INDIVIDUAL');

  // Note terms
  const [principal, setPrincipal] = useState('');
  const [ratePercent, setRatePercent] = useState('');
  const [status, setStatus] = useState('AWAITING');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [firstDate, setFirstDate] = useState('');
  const [maturity, setMaturity] = useState('');

  // Login credentials (login email defaults to the contact email until edited).
  const [loginEmail, setLoginEmail] = useState('');
  const [loginTouched, setLoginTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);

  const [busy, setBusy] = useState(false);

  const effectiveLoginEmail = loginTouched ? loginEmail : email;

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
      const res = await api.post<{ investorId: string }>('/api/team/accounts', {
        name,
        email,
        type,
        loginEmail: effectiveLoginEmail || undefined,
        password,
        mustChange,
        principal,
        ratePercent: ratePercent || '0',
        status,
        distributionAmount: amount,
        distributionDay: day || '1',
        firstDistributionDate: firstDate || null,
        maturityDate: maturity || null,
      });
      toast(`Account created — share ${effectiveLoginEmail} + password with ${name}`);
      router.push('/console/investors');
      router.refresh();
      void res;
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
              <Field label="ACCOUNT TYPE">
                <div className="segment" style={{ borderRadius: 9 }}>
                  <div data-testid="ca-type-individual" className={`segmentItem${type === 'INDIVIDUAL' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem', color: type === 'INDIVIDUAL' ? '#0b1d3a' : '#5b6473' }} onClick={() => setType('INDIVIDUAL')}>Individual</div>
                  <div data-testid="ca-type-entity" className={`segmentItem${type === 'ENTITY' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem', color: type === 'ENTITY' ? '#0b1d3a' : '#5b6473' }} onClick={() => setType('ENTITY')}>Entity</div>
                </div>
              </Field>
            </div>
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
              <Field label="DISTRIBUTION AMOUNT"><input className="fieldLight" data-testid="ca-amount" placeholder="3,750" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
              <Field label="RECURRING DAY"><input className="fieldLight" data-testid="ca-day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(e.target.value)} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Field label="FIRST DISTRIBUTION"><input className="fieldLight" data-testid="ca-first" type="date" value={firstDate} onChange={(e) => setFirstDate(e.target.value)} /></Field>
              <Field label="MATURITY DATE"><input className="fieldLight" data-testid="ca-maturity" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} /></Field>
            </div>
            <Field label="STATUS">
              <select className="fieldLight" data-testid="ca-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="AWAITING">Awaiting</option>
                <option value="ACTIVE">Active</option>
                <option value="DECLINED">Declined</option>
              </select>
            </Field>
            <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
              Set status to Active with a first distribution date, recurring day, amount and maturity to generate the schedule now. Leave as Awaiting to set terms later from the investor&apos;s detail panel.
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
