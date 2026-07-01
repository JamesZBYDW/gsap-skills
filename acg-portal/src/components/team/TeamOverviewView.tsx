import type { TeamOverviewVM } from '@/server/team';
import Link from 'next/link';
import { Icon } from '@/components/Icon';

export function TeamOverviewView({ vm }: { vm: TeamOverviewVM }) {
  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        <div className="navyTile" style={{ padding: '20px 22px' }}>
          <div style={{ fontSize: '.6rem', fontWeight: 700, letterSpacing: '.14em', color: '#c8a878' }}>TOTAL CAPITAL</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#fff', marginTop: 10 }}>{vm.totalCapital}</div>
          <div style={{ fontSize: '.72rem', color: '#aeb8cb', marginTop: 2 }}>across {vm.activeNotes} active notes</div>
        </div>
        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="tileEyebrow">ACTIVE NOTES</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 10 }}>{vm.activeNotes}</div>
          <div style={{ fontSize: '.72rem', color: '#8b93a3', marginTop: 2 }}>Portfolio</div>
        </div>
        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="tileEyebrow">DISTRIBUTED TO DATE</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 10 }}>{vm.distributed}</div>
          <div style={{ fontSize: '.72rem', color: '#8b93a3', marginTop: 2 }}>to active notes</div>
        </div>
        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="tileEyebrow">MATURING ≤ 90 DAYS</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, marginTop: 10, color: '#b07a1e' }}>{vm.maturingCount}</div>
          <div style={{ fontSize: '.72rem', color: '#8b93a3', marginTop: 2 }}>{vm.maturingPrincipal} principal</div>
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18, alignItems: 'start' }}>
        {/* LEFT: approaching maturities */}
        <div className="card" style={{ padding: '8px 24px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '18px 0 0' }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: '.14em', color: '#a87e45' }}>APPROACHING MATURITIES</div>
            <Link className="linkBtn" href="/console/investors">All investors ›</Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1fr .8fr 1fr',
              padding: '14px 0 11px',
              borderBottom: '1px solid rgba(12,31,61,.08)',
              fontSize: '.62rem',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: '#8b93a3',
              marginTop: 6,
            }}
          >
            <div>Investor</div>
            <div>Principal</div>
            <div>Rate</div>
            <div>Matures</div>
          </div>
          {vm.maturities.length === 0 ? (
            <div style={{ fontSize: '.84rem', color: '#8b93a3', padding: '13px 0' }}>No maturities in the next 90 days.</div>
          ) : (
            vm.maturities.map((m) => (
              <div
                key={m.investorId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.6fr 1fr .8fr 1fr',
                  alignItems: 'center',
                  padding: '13px 0',
                  borderBottom: '1px solid rgba(12,31,61,.05)',
                }}
              >
                <div style={{ fontSize: '.86rem', fontWeight: 600 }}>{m.investor}</div>
                <div style={{ fontSize: '.86rem', fontWeight: 700 }}>{m.principal}</div>
                <div style={{ fontSize: '.84rem', color: '#5b6473' }}>{m.rate}</div>
                <div>
                  <div style={{ fontSize: '.84rem', fontWeight: 600 }}>{m.matures}</div>
                  <div style={{ fontSize: '.72rem', color: m.urgent ? '#b07a1e' : '#8b93a3' }}>{m.days}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* RIGHT: action cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Link
            className="card"
            href="/console/registrations"
            style={{ padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                flex: 'none',
                background: 'rgba(176,122,30,.12)',
                color: '#b07a1e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.05rem',
              }}
            >
              {vm.regCount}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '.9rem', fontWeight: 700 }}>Pending registrations</div>
              <div style={{ fontSize: '.76rem', color: '#8b93a3' }}>Awaiting your review</div>
            </div>
            <Icon name="chevron-right" size={17} color="#9aa1ad" strokeWidth={2} />
          </Link>

          <Link
            className="card"
            href="/console/messages"
            style={{ padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <span
              style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                flex: 'none',
                background: 'rgba(31,138,91,.12)',
                color: '#1f8a5b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.05rem',
              }}
            >
              {vm.msgUnread}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '.9rem', fontWeight: 700 }}>Investor replies</div>
              <div style={{ fontSize: '.76rem', color: '#8b93a3' }}>Unread messages</div>
            </div>
            <Icon name="chevron-right" size={17} color="#9aa1ad" strokeWidth={2} />
          </Link>
        </div>
      </div>
    </div>
  );
}
