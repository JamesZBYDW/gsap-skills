import { Pill } from '../ui/Pill';
import type { ScheduleVM, BarVM, LedgerRowVM } from '@/server/portal';

function tallBar(b: BarVM): React.CSSProperties {
  if (b.status === 'PAID')
    return { flex: 1, height: '100%', borderRadius: 4, background: 'linear-gradient(180deg,#cdaf7e,#a87e45)' };
  if (b.status === 'NEXT') return { flex: 1, height: '100%', borderRadius: 4, background: 'var(--acc)' };
  return { flex: 1, height: '62%', borderRadius: 4, background: 'rgba(12,31,61,.1)' };
}

function dotStyle(row: LedgerRowVM): React.CSSProperties {
  const base: React.CSSProperties = { width: 18, height: 18, borderRadius: '50%', flex: 'none' };
  if (row.status === 'PAID') return { ...base, background: 'rgba(31,138,91,.14)' };
  if (row.status === 'NEXT') return { ...base, background: 'var(--acc)', boxShadow: '0 0 0 4px rgba(0,113,227,.14)' };
  return { ...base, background: 'rgba(12,31,61,.08)' };
}

export function ScheduleView({ vm }: { vm: ScheduleVM }) {
  if (!vm.active) {
    return (
      <div className="content">
        <div className="empty">Your distribution schedule will appear here once your note is active.</div>
      </div>
    );
  }

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        <div className="card" style={{ padding: '18px 22px' }}>
          <div className="tileEyebrow">DISTRIBUTED TO DATE</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 9 }}>{vm.distributedAmount}</div>
          <div style={{ fontSize: '.76rem', color: '#8b93a3', marginTop: 2 }}>
            {vm.paidCount} of {vm.termMonths} payments
          </div>
        </div>
        <div className="card" style={{ padding: '18px 22px' }}>
          <div className="tileEyebrow">NEXT PAYMENT</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 9 }}>{vm.nextDate}</div>
          <div style={{ fontSize: '.76rem', color: 'var(--acc)', fontWeight: 600, marginTop: 2 }}>
            {vm.nextAmount} · {vm.nextArrival}
          </div>
        </div>
        <div className="card" style={{ padding: '18px 22px' }}>
          <div className="tileEyebrow">REMAINING</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 9 }}>{vm.remainingAmount}</div>
          <div style={{ fontSize: '.76rem', color: '#8b93a3', marginTop: 2 }}>
            {vm.remainingCount} payments to maturity
          </div>
        </div>
      </div>

      {/* Term timeline */}
      <div className="card" style={{ padding: '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div className="tileEyebrow">TERM TIMELINE</div>
          <div style={{ fontSize: '.72rem', color: '#8b93a3', fontWeight: 600 }}>
            {vm.rangeStart} — {vm.rangeEnd}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 64 }}>
          {vm.bars.map((b, i) => (
            <i key={i} style={tallBar(b)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: '.72rem', color: '#5b6473' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <i style={{ width: 11, height: 11, borderRadius: 3, background: 'linear-gradient(180deg,#cdaf7e,#a87e45)', display: 'block' }} />
            Paid
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <i style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--acc)', display: 'block' }} />
            Next
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <i style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(12,31,61,.12)', display: 'block' }} />
            Upcoming
          </span>
        </div>
      </div>

      {/* Ledger table */}
      <div className="card" style={{ padding: '8px 24px 14px' }}>
        <div
          className="tableHead"
          style={{ display: 'grid', gridTemplateColumns: '48px 1.4fr 1fr 1fr 1fr', padding: '16px 0 12px' }}
        >
          <div>#</div>
          <div>Distribution date</div>
          <div>Amount</div>
          <div>Status</div>
          <div>Reference</div>
        </div>
        {vm.ledger.map((row) => (
          <div
            key={row.n}
            className="tableRow"
            style={{ display: 'grid', gridTemplateColumns: '48px 1.4fr 1fr 1fr 1fr', alignItems: 'center', padding: '13px 0' }}
          >
            <div style={{ fontSize: '.78rem', color: '#9aa1ad', fontWeight: 600 }}>{row.n}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={dotStyle(row)} />
              <span style={{ fontSize: '.88rem', fontWeight: 600 }}>{row.date}</span>
            </div>
            <div style={{ fontSize: '.88rem', fontWeight: 700 }}>{row.amount}</div>
            <div>
              <Pill tone={row.tone}>{row.statusLabel}</Pill>
            </div>
            <div style={{ fontSize: '.8rem', color: '#9aa1ad' }} className="mono">
              {row.ref}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
