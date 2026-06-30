'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/ui/Pill';
import { SlideOver } from '@/components/ui/SlideOver';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import type { TeamRequestVM } from '@/server/team';

const GRID = '1.3fr .9fr 1.4fr 1.1fr .8fr';

export function RequestsQueueView({ requests }: { requests: TeamRequestVM[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<TeamRequestVM | null>(null);
  const [busy, setBusy] = useState(false);

  async function updateStatus(req: TeamRequestVM, status: string) {
    setBusy(true);
    try {
      await api.patch(`/api/team/requests/${req.id}`, { status });
      toast(`Request marked ${status.toLowerCase()}`);
      router.refresh();
      setSelected(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <div className="card" style={{ padding: '6px 24px 12px' }}>
        <div
          className="tableHead"
          style={{ display: 'grid', gridTemplateColumns: GRID, padding: '16px 0 12px' }}
        >
          <div>Investor</div>
          <div>Type</div>
          <div>Request</div>
          <div>Status</div>
          <div style={{ textAlign: 'right' }}>Action</div>
        </div>
        {requests.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              alignItems: 'center',
              padding: '15px 0',
              borderBottom: '1px solid rgba(12,31,61,.05)',
            }}
          >
            <div style={{ fontSize: '.86rem', fontWeight: 600 }}>{r.investorName}</div>
            <div style={{ fontSize: '.82rem', color: '#5b6473' }}>{r.typeLabel}</div>
            <div style={{ fontSize: '.84rem' }}>{r.title}</div>
            <div>
              <Pill tone={r.tone}>{r.statusLabel}</Pill>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button className="linkBtn" style={{ padding: '6px 12px' }} onClick={() => setSelected(r)}>
                Review
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <SlideOver
          onClose={() => setSelected(null)}
          zIndexClass={75}
          header={
            <div>
              <div className="tileEyebrow">{selected.typeLabel} · REQUEST</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>{selected.title}</div>
              <div style={{ marginTop: 9 }}>
                <Pill tone={selected.tone}>{selected.statusLabel}</Pill>
              </div>
            </div>
          }
        >
          <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '.8rem', color: '#8b93a3' }}>Investor</span>
              <span style={{ fontSize: '.86rem', fontWeight: 600 }}>{selected.investorName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '.8rem', color: '#8b93a3' }}>Submitted</span>
              <span style={{ fontSize: '.86rem', fontWeight: 600 }}>{selected.date}</span>
            </div>
            {selected.detail && (
              <div style={{ borderTop: '1px solid rgba(12,31,61,.07)', paddingTop: 12, fontSize: '.84rem', color: '#5b6473' }}>
                {selected.detail}
              </div>
            )}
          </div>

          {selected.note && <div className="amberNote">{selected.note}</div>}

          <div>
            <div className="tileEyebrow" style={{ marginBottom: 12 }}>UPDATE STATUS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button
                className="btnApprove"
                disabled={busy}
                style={{ padding: '12px 14px', borderRadius: 11 }}
                onClick={() => updateStatus(selected, 'APPROVED')}
              >
                <Icon name="check" size={15} strokeWidth={2.4} />Approve
              </button>
              <button
                className="btnNeutral"
                disabled={busy}
                style={{ padding: '12px 14px', borderRadius: 11 }}
                onClick={() => updateStatus(selected, 'COMPLETED')}
              >
                Mark completed
              </button>
              <button
                className="btnNeutral"
                disabled={busy}
                style={{ padding: '12px 14px', borderRadius: 11 }}
                onClick={() => updateStatus(selected, 'NEEDS_INFO')}
              >
                Request more info
              </button>
              <button
                className="btnDanger"
                disabled={busy}
                style={{ padding: '12px 14px', borderRadius: 11 }}
                onClick={() => updateStatus(selected, 'DECLINED')}
              >
                Decline
              </button>
            </div>
          </div>
        </SlideOver>
      )}
    </div>
  );
}
