'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '../Icon';
import { Pill } from '../ui/Pill';
import { useComposer } from './ComposerProvider';
import type { OverviewVM, BarVM } from '@/server/portal';

function miniBar(b: BarVM): React.CSSProperties {
  const base: React.CSSProperties = { flex: 1, height: '100%', borderRadius: 3 };
  if (b.status === 'PAID') return { ...base, background: 'linear-gradient(180deg,#cdaf7e,#a87e45)' };
  if (b.status === 'NEXT') return { ...base, background: 'var(--acc)' };
  return { ...base, background: 'rgba(12,31,61,.12)' };
}

export function OverviewView({ vm }: { vm: OverviewVM }) {
  const router = useRouter();
  const { openCompose } = useComposer();

  if (!vm.active) {
    return (
      <div className="content">
        <div className="card" style={{ padding: '30px 32px', maxWidth: 640 }}>
          <div className="tileEyebrow">YOUR NOTE</div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 10 }}>
            {vm.state === 'PENDING' ? 'Your registration is under review' : 'Your note is being set up'}
          </div>
          <p style={{ fontSize: '.9rem', color: 'var(--text-2)', marginTop: 10, lineHeight: 1.6 }}>
            {vm.state === 'PENDING'
              ? 'Our Investor Relations team is reviewing your request. We will email you once your account is approved.'
              : 'Your account is approved. Your note activates once we record your wire — we will share wire instructions by secure email and confirm by phone.'}
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 22, flexWrap: 'wrap' }}>
            <div>
              <div className="tileEyebrow">PRINCIPAL</div>
              <div className="tileValue" style={{ marginTop: 8 }}>{vm.principal}</div>
            </div>
            <div>
              <div className="tileEyebrow">FIXED RATE</div>
              <div className="tileValue" style={{ marginTop: 8 }}>{vm.rate}</div>
              <div className="tileSub">{vm.rateSub}</div>
            </div>
            <div>
              <div className="tileEyebrow">STATUS</div>
              <div style={{ marginTop: 12 }}><Pill tone={vm.statusTone}>{vm.statusLabel}</Pill></div>
            </div>
          </div>
          <div className="quietNote" style={{ marginTop: 22 }}>
            Returns are fixed for the term — not guaranteed.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="content" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, alignContent: 'start' }}>
      {/* Next distribution (span 2, navy) */}
      <div className="navyTile" style={{ gridColumn: 'span 2', padding: '24px 26px', position: 'relative', overflow: 'hidden', minHeight: 154, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div aria-hidden style={{ position: 'absolute', top: -70, right: -40, width: 210, height: 210, background: 'radial-gradient(closest-side,rgba(200,168,120,.22),transparent)' }} />
        <div style={{ position: 'relative', fontSize: '.62rem', fontWeight: 700, letterSpacing: '.16em', color: '#c8a878' }}>NEXT DISTRIBUTION</div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: '2.7rem', fontWeight: 800, letterSpacing: '-.03em', color: '#fff', lineHeight: 1 }}>{vm.next?.amount ?? '—'}</div>
          <div style={{ fontSize: '.88rem', color: '#aeb8cb', marginTop: 6 }}>
            {vm.next?.arrival} · <span style={{ color: '#fff', fontWeight: 600 }}>{vm.next?.date}</span>
          </div>
        </div>
      </div>

      {/* Maturity ring (span 2) */}
      <div className="card" style={{ gridColumn: 'span 2', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 22, minHeight: 154 }}>
        <svg width="116" height="116" viewBox="0 0 120 120" style={{ flex: 'none' }}>
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(12,31,61,.09)" strokeWidth="11" />
          <circle cx="60" cy="60" r="50" fill="none" stroke="#a87e45" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${vm.maturity?.dash ?? 0} ${vm.maturity?.circumference ?? 314}`} transform="rotate(-90 60 60)" />
          <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0c1f3d" fontFamily="inherit">{vm.maturity?.percent ?? 0}%</text>
          <text x="60" y="74" textAnchor="middle" fontSize="10" fontWeight="600" fill="#8b93a3" fontFamily="inherit">of term</text>
        </svg>
        <div>
          <div className="tileEyebrow">MATURITY</div>
          <div style={{ fontSize: '1.22rem', fontWeight: 800, letterSpacing: '-.02em', marginTop: 8 }}>{vm.maturity?.dateLabel}</div>
          <div style={{ fontSize: '.84rem', color: 'var(--text-2)', marginTop: 3 }}>{vm.maturity?.remaining}</div>
          <div style={{ fontSize: '.8rem', color: 'var(--ok)', fontWeight: 600, marginTop: 8 }}>{vm.maturity?.paidLabel}</div>
        </div>
      </div>

      {/* Stat tiles */}
      <StatTile label="PRINCIPAL" value={vm.principal} />
      <StatTile label="FIXED RATE" value={vm.rate} sub={vm.rateSub} />
      <div className="card" style={{ padding: '18px 20px' }}>
        <div className="tileEyebrow">STATUS</div>
        <div className="tileValue" style={{ marginTop: 10, color: 'var(--ok)' }}>{vm.statusLabel}</div>
        <div className="tileSub">{vm.statusSub}</div>
      </div>
      <StatTile label="MONTHLY INCOME" value={vm.monthly} sub="on the 1st" />

      {/* Distributed to date (span 2) */}
      <div className="card" style={{ gridColumn: 'span 2', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="tileEyebrow">DISTRIBUTED TO DATE</div>
          <div style={{ fontSize: '.72rem', color: '#8b93a3', fontWeight: 600 }}>{vm.distributed.count}</div>
        </div>
        <div className="tileValue" style={{ marginTop: 8 }}>{vm.distributed.amount}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40, marginTop: 12 }}>
          {vm.bars.map((b, i) => (
            <i key={i} style={miniBar(b)} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.66rem', color: '#8b93a3', marginTop: 7 }}>
          <span>{vm.termRangeStart}</span>
          <span>{vm.termRangeEnd}</span>
        </div>
      </div>

      {/* Quick actions (span 2) */}
      <div className="card" style={{ gridColumn: 'span 2', padding: '18px 22px', display: 'flex', flexDirection: 'column' }}>
        <div className="tileEyebrow">QUICK ACTIONS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <button className="quickAction" onClick={() => openCompose('ADD_CAPITAL')}>
            <Icon name="plus" size={16} color="var(--acc)" strokeWidth={2} />Add capital
          </button>
          <button className="quickAction" onClick={() => openCompose('UPDATE_BANKING')}>
            <Icon name="building" size={16} color="var(--acc)" />Update banking
          </button>
          <button className="quickAction" onClick={() => openCompose('DOCUMENT')}>
            <Icon name="file" size={16} color="var(--acc)" />Request document
          </button>
          <button className="quickAction" onClick={() => router.push('/portal/messages')}>
            <Icon name="message" size={16} color="var(--acc)" />Message IR
          </button>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div className="tileEyebrow">{label}</div>
      <div className="tileValue" style={{ marginTop: 10 }}>{value}</div>
      {sub && <div className="tileSub">{sub}</div>}
    </div>
  );
}
