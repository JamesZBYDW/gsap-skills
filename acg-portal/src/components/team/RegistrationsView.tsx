'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import type { RegistrationVM } from '@/server/team';

export function RegistrationsView({ registrations }: { registrations: RegistrationVM[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, path: string, message: string) {
    setBusy(id);
    try {
      await api.post(`/api/team/registrations/${id}/${path}`);
      toast(message);
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  if (registrations.length === 0) {
    return (
      <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="empty">No pending registrations. New sign-ups will appear here for review.</div>
      </div>
    );
  }

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {registrations.map((g) => (
        <div key={g.id} className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, flex: 'none', background: 'rgba(176,122,30,.12)', color: '#b07a1e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="user" size={20} color="#b07a1e" strokeWidth={1.8} />
              </span>
              <div>
                <div style={{ fontSize: '1.02rem', fontWeight: 700 }}>{g.name}</div>
                <div style={{ fontSize: '.8rem', color: '#5b6473' }}>{g.type} · {g.email}</div>
              </div>
            </div>
            <div style={{ fontSize: '.76rem', color: '#9aa1ad' }}>Submitted {g.date}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, margin: '18px 0', padding: '16px 0', borderTop: '1px solid rgba(12,31,61,.06)', borderBottom: '1px solid rgba(12,31,61,.06)' }}>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 700, letterSpacing: '.1em', color: '#8b93a3' }}>INTENDED PRINCIPAL</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 6 }}>{g.principal}</div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 700, letterSpacing: '.1em', color: '#8b93a3' }}>TERM</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 6 }}>{g.term}</div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 700, letterSpacing: '.1em', color: '#8b93a3' }}>RATE</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 6 }}>{g.rate}</div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 700, letterSpacing: '.1em', color: '#8b93a3' }}>ACCREDITED</div>
              <div style={{ fontSize: '.84rem', fontWeight: 600, marginTop: 8, color: '#1f8a5b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={14} color="#1f8a5b" strokeWidth={3} />Acknowledged
              </div>
            </div>
          </div>

          {g.infoRequested && (
            <div style={{ fontSize: '.8rem', color: '#b07a1e', background: 'rgba(176,122,30,.08)', borderRadius: 10, padding: '10px 13px', marginBottom: 12 }}>
              More information requested — awaiting the applicant&apos;s reply.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btnApprove" disabled={busy === g.id} onClick={() => act(g.id, 'approve', 'Approved — investor created (Awaiting wire)')}>
              <Icon name="check" size={15} strokeWidth={2.4} />Approve
            </button>
            <button className="btnNeutral" disabled={busy === g.id} onClick={() => act(g.id, 'request-info', 'Requested more information')}>
              Request more info
            </button>
            <button className="btnDanger" disabled={busy === g.id} onClick={() => act(g.id, 'decline', 'Registration declined')}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
