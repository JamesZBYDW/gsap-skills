'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvestorRowVM } from '@/server/team';
import { Pill } from '@/components/ui/Pill';
import { SlideOver } from '@/components/ui/SlideOver';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

const STATES = ['All', 'Active', 'Awaiting'] as const;

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
  const [status, setStatus] = useState<string>(['ACTIVE', 'AWAITING', 'DECLINED'].includes(e.status) ? e.status : 'AWAITING');
  const [firstDate, setFirstDate] = useState(e.firstDistributionISO);
  const [day, setDay] = useState(String(e.distributionDay || 1));
  const [amount, setAmount] = useState(e.amountDollars);
  const [maturity, setMaturity] = useState(e.maturityISO);
  const [noteBusy, setNoteBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState(investor.email);
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [credBusy, setCredBusy] = useState(false);

  async function saveNote() {
    setNoteBusy(true);
    try {
      await api.patch(`/api/team/investors/${investor.id}/note`, {
        principal,
        ratePercent,
        status,
        firstDistributionDate: firstDate,
        distributionDay: day,
        distributionAmount: amount,
        maturityDate: maturity,
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
        <div className="tileEyebrow">MANAGE NOTE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="PRINCIPAL"><input className="fieldLight" data-testid="mn-principal" placeholder="250,000" value={principal} onChange={(x) => setPrincipal(x.target.value)} /></Field>
            <Field label="FIXED RATE %"><input className="fieldLight" data-testid="mn-rate" placeholder="18" value={ratePercent} onChange={(x) => setRatePercent(x.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="DISTRIBUTION AMOUNT"><input className="fieldLight" data-testid="mn-amount" placeholder="3,750" value={amount} onChange={(x) => setAmount(x.target.value)} /></Field>
            <Field label="RECURRING DAY"><input className="fieldLight" data-testid="mn-day" type="number" min={1} max={28} value={day} onChange={(x) => setDay(x.target.value)} /></Field>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Field label="FIRST DISTRIBUTION"><input className="fieldLight" data-testid="mn-first" type="date" value={firstDate} onChange={(x) => setFirstDate(x.target.value)} /></Field>
            <Field label="MATURITY DATE"><input className="fieldLight" data-testid="mn-maturity" type="date" value={maturity} onChange={(x) => setMaturity(x.target.value)} /></Field>
          </div>
          <Field label="STATUS">
            <select className="fieldLight" data-testid="mn-status" value={status} onChange={(x) => setStatus(x.target.value)}>
              <option value="AWAITING">Awaiting</option>
              <option value="ACTIVE">Active</option>
              <option value="DECLINED">Declined</option>
            </select>
          </Field>
          <button className="btnPrimary" data-testid="mn-save" style={{ padding: '11px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={saveNote} disabled={noteBusy}>
            {noteBusy ? 'Saving…' : 'Save note & regenerate schedule'}
          </button>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
            Set status to Active with a first distribution date, recurring day, amount and maturity — the investor&apos;s schedule generates from these.
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
