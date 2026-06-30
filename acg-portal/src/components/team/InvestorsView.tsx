'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InvestorRowVM } from '@/server/team';
import { Pill } from '@/components/ui/Pill';
import { Modal } from '@/components/ui/Modal';
import { SlideOver } from '@/components/ui/SlideOver';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import { TERM_OPTIONS } from '@/lib/rates';

const GRID = '1.7fr .9fr 1fr 1fr .7fr .7fr 36px';
const DEFAULT_TERM = TERM_OPTIONS[0]?.months ?? 12;
type FilterKey = 'ALL' | 'ACTIVE' | 'AWAITING' | 'PENDING';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'AWAITING', label: 'Awaiting' },
  { key: 'PENDING', label: 'Pending' },
];

export function InvestorsView({ investors }: { investors: InvestorRowVM[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [selected, setSelected] = useState<InvestorRowVM | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Add-investor form
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [term, setTerm] = useState<number>(DEFAULT_TERM);
  const [busy, setBusy] = useState(false);

  const filtered = investors.filter((r) => {
    if (filter !== 'ALL' && r.state !== filter) return false;
    if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  async function recordWire(inv: InvestorRowVM) {
    if (busy) return;
    setBusy(true);
    try {
      await api.post(`/api/team/investors/${inv.id}/record-wire`);
      toast('Wire recorded — note activated');
      setSelected(null);
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function viewPortal(inv: InvestorRowVM) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post<{ redirectTo: string }>('/api/team/impersonate', { investorId: inv.id });
      router.push(res.redirectTo);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post('/api/team/investors', { name, principal, termMonths: term, type: 'INDIVIDUAL' });
      toast('Investor added — Awaiting wire');
      setAddOpen(false);
      setName('');
      setPrincipal('');
      setTerm(DEFAULT_TERM);
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Request failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content" style={{ paddingTop: 22 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div className="searchBox">
          <Icon name="search" size={16} color="#9aa1ad" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search investors…"
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`filterPill${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <button className="chip chip--filled" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={14} color="#fff" strokeWidth={2.2} />
          Add investor
        </button>
      </div>

      {/* Roster table */}
      <div className="card" style={{ padding: '6px 24px 12px' }}>
        <div
          className="tableHead"
          style={{ display: 'grid', gridTemplateColumns: GRID, padding: '16px 0 12px' }}
        >
          <div>Investor</div>
          <div>Type</div>
          <div>State</div>
          <div>Principal</div>
          <div>Rate</div>
          <div>Term</div>
          <div />
        </div>
        {filtered.map((r) => (
          <div
            key={r.id}
            className="tableRow tableRow--click"
            onClick={() => setSelected(r)}
            style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '14px 0' }}
          >
            <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: '.82rem', color: '#5b6473' }}>{r.type}</div>
            <div>
              <Pill tone={r.tone}>{r.stateLabel}</Pill>
            </div>
            <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{r.principal}</div>
            <div style={{ fontSize: '.84rem', color: '#5b6473' }}>{r.rate}</div>
            <div style={{ fontSize: '.84rem', color: '#5b6473' }}>{r.term}</div>
            <div style={{ textAlign: 'right' }}>
              <Icon name="chevron-right" size={16} color="#c2c7d0" strokeWidth={2} />
            </div>
          </div>
        ))}
      </div>

      {/* Detail slide-over */}
      {selected && (
        <SlideOver
          onClose={() => setSelected(null)}
          header={
            <>
              <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: '.14em', color: '#a87e45' }}>
                INVESTOR
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 4 }}>{selected.name}</div>
              <div style={{ marginTop: 9 }}>
                <Pill tone={selected.tone}>{selected.stateLabel}</Pill>
              </div>
            </>
          }
        >
          {/* Facts */}
          <div
            className="card"
            style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}
          >
            <FactRow label="Type" value={selected.type} />
            <FactRow label="Email" value={selected.email} />
            <FactRow label="Principal" value={selected.principal} bold />
            <FactRow label="Rate · term" value={`${selected.rate} · ${selected.term}`} />
            <FactRow label="Wire received" value={selected.wire} />
            <FactRow label="Maturity" value={selected.maturity} />
          </div>

          {/* Actions */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: '.14em', color: '#a87e45' }}>
              ACTIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
              {(selected.state === 'AWAITING' || selected.state === 'PENDING') && (
                <button
                  onClick={() => recordWire(selected)}
                  disabled={busy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 11,
                    background: 'var(--acc)',
                    color: '#fff',
                    fontSize: '.84rem',
                    fontWeight: 600,
                  }}
                >
                  <Icon name="lines" size={16} color="#fff" strokeWidth={2} />
                  Record wire & activate note
                </button>
              )}
              {selected.state === 'ACTIVE' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    fontSize: '.84rem',
                    fontWeight: 600,
                    color: '#1f8a5b',
                    background: 'rgba(31,138,91,.1)',
                    padding: '12px 14px',
                    borderRadius: 11,
                  }}
                >
                  <Icon name="check" size={16} color="#1f8a5b" strokeWidth={2.4} />
                  Note active — schedule generated
                </div>
              )}
              <button className="btnNeutral" style={actionBtn} onClick={() => viewPortal(selected)} disabled={busy}>
                View investor portal (read-only)
              </button>
              <button className="btnNeutral" style={actionBtn} onClick={() => router.push('/console/messages')}>
                Message investor
              </button>
              <button className="btnNeutral" style={actionBtn} disabled>
                Edit terms
              </button>
            </div>
            <div style={{ fontSize: '.74rem', color: '#8b93a3', marginTop: 14 }}>
              Recording the wire activates the note and generates its distribution schedule from the wire date.
            </div>
          </div>
        </SlideOver>
      )}

      {/* Add-investor modal */}
      {addOpen && (
        <Modal
          title="Add investor"
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <button className="btnGhost" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button
                onClick={submitAdd}
                disabled={busy}
                style={{
                  padding: '11px 22px',
                  borderRadius: 10,
                  background: 'var(--acc)',
                  color: '#fff',
                  fontSize: '.84rem',
                  fontWeight: 700,
                }}
              >
                Add investor
              </button>
            </>
          }
        >
          <div>
            <div className="fieldLabelGold">LEGAL NAME</div>
            <input
              className="fieldLight"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full legal name or entity"
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="fieldLabelGold">PRINCIPAL</div>
              <input
                className="fieldLight"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                placeholder="250,000"
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="fieldLabelGold">TERM</div>
              <select
                className="fieldLight"
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
              >
                {TERM_OPTIONS.map((t) => (
                  <option key={t.months} value={t.months}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
            The investor is created in Awaiting state. Record the wire to activate the note.
          </div>
        </Modal>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 11,
  fontSize: '.84rem',
  fontWeight: 600,
  textAlign: 'left',
};

function FactRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '.8rem', color: '#8b93a3' }}>{label}</span>
      <span style={{ fontSize: '.86rem', fontWeight: bold ? 700 : 600 }}>{value}</span>
    </div>
  );
}
