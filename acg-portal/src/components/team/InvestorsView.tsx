'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvestorRowVM } from '@/server/team';
import { Pill } from '@/components/ui/Pill';
import { SlideOver } from '@/components/ui/SlideOver';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import { TERM_OPTIONS } from '@/lib/rates';
import { computeDistributionDollars, addMonthsISO, addDaysISO, formatISOToLong } from '@/lib/noteterms';

const STATES = ['All', 'Active', 'Awaiting', 'Expired'] as const;

export function InvestorsView({ investors }: { investors: InvestorRowVM[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof STATES)[number]>('All');
  const [detailId, setDetailId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return investors.filter(
      (i) => (filter === 'All' || i.stateLabel === filter) && (!q || i.name.toLowerCase().includes(q)),
    );
  }, [investors, search, filter]);

  const selected = investors.find((i) => i.id === detailId) ?? null;

  return (
    <div className="content" style={{ paddingTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="searchBox">
          <Icon name="search" size={16} color="#9aa1ad" strokeWidth={2} />
          <input placeholder="Search investors…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {STATES.map((s) => (
          <button key={s} className={`filterPill${filter === s ? ' active' : ''}`} onClick={() => setFilter(s)}>
            {s}
          </button>
        ))}
        <button className="chip chip--filled" onClick={() => router.push('/console/create')}>
          <Icon name="plus" size={14} strokeWidth={2.2} />Create account
        </button>
      </div>

      <div className="card" style={{ padding: '6px 24px 12px' }}>
        <div className="tableHead" style={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr 1fr 1fr .7fr .7fr 36px', padding: '16px 0 12px' }}>
          <div>Investor</div><div>Type</div><div>State</div><div>Principal</div><div>Rate</div><div>Term</div><div />
        </div>
        {rows.map((r) => (
          <div
            key={r.id}
            className="tableRow tableRow--click"
            style={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr 1fr 1fr .7fr .7fr 36px', alignItems: 'center', padding: '14px 0' }}
            onClick={() => setDetailId(r.id)}
          >
            <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: '.82rem', color: '#5b6473' }}>{r.type}</div>
            <div><Pill tone={r.tone}>{r.stateLabel}</Pill></div>
            <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{r.principal}</div>
            <div style={{ fontSize: '.84rem', color: '#5b6473' }}>{r.rate}</div>
            <div style={{ fontSize: '.84rem', color: '#5b6473' }}>{r.term}</div>
            <div style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} color="#c2c7d0" strokeWidth={2} /></div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding: '28px 0', textAlign: 'center', color: '#8b93a3', fontSize: '.9rem' }}>No investors match.</div>}
      </div>

      {selected && (
        <InvestorDetail key={selected.id} investor={selected} onClose={() => setDetailId(null)} onChanged={() => router.refresh()} />
      )}
    </div>
  );
}

// ─── Detail slide-over: facts + Manage note + Set login ─────────────────────

function InvestorDetail({
  investor,
  onClose,
  onChanged,
}: {
  investor: InvestorRowVM;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const e = investor.edit;

  const [principal, setPrincipal] = useState(e.principalDollars);
  const [ratePercent, setRatePercent] = useState(e.ratePercent);
  const [termMonths, setTermMonths] = useState(e.termMonths || 24);
  const [wireDate, setWireDate] = useState(e.wireReceivedISO);
  const [noteBusy, setNoteBusy] = useState(false);

  const amount = computeDistributionDollars(principal, ratePercent);
  const firstISO = addDaysISO(wireDate, 30);
  const maturityISO = addMonthsISO(wireDate, termMonths);
  const autoStatus = wireDate ? 'Active' : 'Awaiting wire';

  const [loginEmail, setLoginEmail] = useState(investor.email);
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [credBusy, setCredBusy] = useState(false);

  // Profile (what the investor sees on their Profile page — management edits it).
  const pf = investor.profile;
  const [pName, setPName] = useState(pf.name);
  const [pEmail, setPEmail] = useState(pf.email);
  const [pType, setPType] = useState<'INDIVIDUAL' | 'ENTITY'>(pf.type);
  const [pPhone, setPPhone] = useState(pf.phone);
  const [pBank, setPBank] = useState(pf.bankName);
  const [pLast4, setPLast4] = useState(pf.bankLast4);
  const [pMethod, setPMethod] = useState(pf.bankMethod);
  const [pW9, setPW9] = useState(pf.w9OnFile);
  const [profileBusy, setProfileBusy] = useState(false);

  async function saveProfile() {
    setProfileBusy(true);
    try {
      await api.patch(`/api/team/investors/${investor.id}/profile`, {
        name: pName,
        email: pEmail,
        type: pType,
        phone: pPhone,
        bankName: pBank,
        bankLast4: pLast4,
        bankMethod: pMethod,
        w9OnFile: pW9,
      });
      toast('Profile saved — the investor sees this on their Profile page');
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save profile');
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveNote() {
    setNoteBusy(true);
    try {
      await api.patch(`/api/team/investors/${investor.id}/note`, {
        principal,
        ratePercent,
        termMonths,
        wireReceivedDate: wireDate || null,
      });
      toast('Note terms saved — schedule updated');
      onChanged();
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not save note terms');
    } finally {
      setNoteBusy(false);
    }
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let p = '';
    for (let i = 0; i < 14; i++) p += chars[Math.floor(Math.random() * chars.length)];
    setPassword(p + '2a');
  }

  async function setLogin() {
    setCredBusy(true);
    try {
      await api.post(`/api/team/investors/${investor.id}/credentials`, { email: loginEmail, password, mustChange });
      toast(`Login set — share ${loginEmail} + password with the investor`);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not set login');
    } finally {
      setCredBusy(false);
    }
  }

  async function impersonate() {
    try {
      const res = await api.post<{ redirectTo: string }>('/api/team/impersonate', { investorId: investor.id });
      router.push(res.redirectTo);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open portal view');
    }
  }

  const label: React.CSSProperties = { fontSize: '.8rem', color: '#8b93a3' };
  const val: React.CSSProperties = { fontSize: '.86rem', fontWeight: 600 };

  return (
    <SlideOver
      onClose={onClose}
      header={
        <>
          <div className="tileEyebrow">INVESTOR</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>{investor.name}</div>
          <div style={{ marginTop: 9 }}><Pill tone={investor.tone}>{investor.stateLabel}</Pill></div>
        </>
      }
    >
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        {([
          ['Type', investor.type],
          ['Email', investor.email],
          ['Phone', investor.profile.phone || '—'],
          ['Principal', investor.principal],
          ['Rate · term', `${investor.rate} · ${investor.term}`],
          ['Maturity', investor.maturity],
          ['Login', investor.hasLogin ? 'Provisioned' : 'Not set'],
        ] as const).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={label}>{k}</span><span style={val}>{v}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="tileEyebrow">PROFILE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <Field label="LEGAL NAME"><input className="fieldLight" data-testid="mp-name" value={pName} onChange={(x) => setPName(x.target.value)} /></Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="CONTACT EMAIL"><input className="fieldLight" data-testid="mp-email" value={pEmail} onChange={(x) => setPEmail(x.target.value)} /></Field>
            <Field label="PHONE"><input className="fieldLight" data-testid="mp-phone" placeholder="(212) 555-0100" value={pPhone} onChange={(x) => setPPhone(x.target.value)} /></Field>
          </div>
          <Field label="ACCOUNT TYPE">
            <div className="segment" style={{ borderRadius: 9 }}>
              <div className={`segmentItem${pType === 'INDIVIDUAL' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem', color: pType === 'INDIVIDUAL' ? '#0b1d3a' : '#5b6473' }} onClick={() => setPType('INDIVIDUAL')}>Individual</div>
              <div className={`segmentItem${pType === 'ENTITY' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem', color: pType === 'ENTITY' ? '#0b1d3a' : '#5b6473' }} onClick={() => setPType('ENTITY')}>Entity</div>
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="BANK"><input className="fieldLight" data-testid="mp-bank" placeholder="Chase" value={pBank} onChange={(x) => setPBank(x.target.value)} /></Field>
            <Field label="ACCOUNT LAST-4"><input className="fieldLight" data-testid="mp-last4" placeholder="6042" maxLength={4} value={pLast4} onChange={(x) => setPLast4(x.target.value)} /></Field>
          </div>
          <Field label="PAYMENT METHOD"><input className="fieldLight" data-testid="mp-method" placeholder="ACH · monthly" value={pMethod} onChange={(x) => setPMethod(x.target.value)} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.8rem', color: '#5b6473', cursor: 'pointer' }}>
            <input type="checkbox" data-testid="mp-w9" checked={pW9} onChange={(x) => setPW9(x.target.checked)} />
            Form W-9 on file
          </label>
          <button className="btnPrimary" data-testid="mp-save" style={{ padding: '11px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={saveProfile} disabled={profileBusy || pName.trim().length < 2 || !pEmail.includes('@')}>
            {profileBusy ? 'Saving…' : 'Save profile'}
          </button>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
            This is what the investor sees on their Profile page. Banking changes are confirmed with the investor by phone before you record them here.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="tileEyebrow">MANAGE NOTE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="PRINCIPAL"><input className="fieldLight" data-testid="mn-principal" placeholder="250,000" value={principal} onChange={(x) => setPrincipal(x.target.value)} /></Field>
            <Field label="FIXED RATE %"><input className="fieldLight" data-testid="mn-rate" placeholder="18" value={ratePercent} onChange={(x) => setRatePercent(x.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="TERM">
              <select className="fieldLight" data-testid="mn-term" value={termMonths} onChange={(x) => setTermMonths(Number(x.target.value))}>
                {TERM_OPTIONS.map((t) => (
                  <option key={t.months} value={t.months}>{t.yearsLabel}</option>
                ))}
              </select>
            </Field>
            <Field label="DISTRIBUTION AMOUNT (AUTO)"><input className="fieldLight" data-testid="mn-amount" value={amount ? `$${amount}` : '—'} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="WIRE RECEIVED"><input className="fieldLight" data-testid="mn-wire" type="date" value={wireDate} onChange={(x) => setWireDate(x.target.value)} /></Field>
            <Field label="FIRST DISTRIBUTION (AUTO)"><input className="fieldLight" data-testid="mn-first" value={firstISO ? formatISOToLong(firstISO) : '—'} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="MATURITY (AUTO)"><input className="fieldLight" data-testid="mn-maturity" value={maturityISO ? formatISOToLong(maturityISO) : '—'} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} /></Field>
            <Field label="STATUS (AUTO)"><input className="fieldLight" data-testid="mn-status" value={autoStatus} readOnly tabIndex={-1} style={{ background: 'rgba(12,31,61,.04)', color: '#5b6473' }} /></Field>
          </div>
          <button className="btnPrimary" data-testid="mn-save" style={{ padding: '11px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={saveNote} disabled={noteBusy}>
            {noteBusy ? 'Saving…' : 'Save note & regenerate schedule'}
          </button>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
            Everything derives from the wire-received date: the note goes Active when it&apos;s set, the first distribution lands 30 days later, distributions recur every 30 days, the final one returns the principal, and the note expires after it. Amount = principal × rate ÷ 12; maturity = wire date + term.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="tileEyebrow">INVESTOR LOGIN</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <Field label="LOGIN EMAIL"><input className="fieldLight" data-testid="cred-email" value={loginEmail} onChange={(x) => setLoginEmail(x.target.value)} /></Field>
          <Field label="INITIAL PASSWORD">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="fieldLight" data-testid="cred-password" value={password} onChange={(x) => setPassword(x.target.value)} placeholder="Set or generate" />
              <button className="btnNeutral" style={{ padding: '0 14px', whiteSpace: 'nowrap' }} onClick={generatePassword} type="button">Generate</button>
            </div>
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.8rem', color: '#5b6473', cursor: 'pointer' }}>
            <input type="checkbox" checked={mustChange} onChange={(x) => setMustChange(x.target.checked)} />
            Require the investor to change it after first sign-in
          </label>
          <button className="btnPrimary" data-testid="cred-save" style={{ padding: '11px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={setLogin} disabled={credBusy || password.length < 10}>
            {credBusy ? 'Saving…' : investor.hasLogin ? 'Reset login' : 'Create login'}
          </button>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
            {investor.hasLogin ? 'This investor already has a login. Resetting sets a new password.' : 'Creates the investor’s sign-in. Share the email + password securely; they can change it in Profile.'} At least 10 characters, letters + numbers.
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="tileEyebrow">ACTIONS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
          <button className="btnNeutral" onClick={impersonate}>View investor portal (read-only)</button>
        </div>
      </div>
    </SlideOver>
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
