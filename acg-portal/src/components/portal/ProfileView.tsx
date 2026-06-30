'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProfileVM } from '@/server/portal';
import { Toggle } from '@/components/ui/Toggle';
import { Icon } from '@/components/Icon';
import { useComposer } from '@/components/portal/ComposerProvider';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

type NotifKey = 'distributionPosted' | 'maturityReminder' | 'newMessage';

const rowLabel: React.CSSProperties = { fontSize: '.82rem', color: '#8b93a3' };
const rowValue: React.CSSProperties = { fontSize: '.88rem', fontWeight: 600 };
const cardStyle: React.CSSProperties = { padding: '24px 26px' };

export function ProfileView({ vm }: { vm: ProfileVM }) {
  const router = useRouter();
  const { toast } = useToast();
  const { openCompose, readOnly } = useComposer();
  const [notif, setNotif] = useState(vm.notif);

  async function setPref(key: NotifKey, value: boolean) {
    const prev = notif;
    setNotif({ ...prev, [key]: value });
    try {
      await api.patch('/api/profile/notifications', { key, value });
      router.refresh();
    } catch (e) {
      setNotif(prev);
      toast(e instanceof ApiError ? e.message : 'Could not update notifications');
    }
  }

  return (
    <div className="content" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
      {/* ACCOUNT */}
      <div className="card" style={cardStyle}>
        <div className="tileEyebrow">ACCOUNT</div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={rowLabel}>Legal name</span><span style={rowValue}>{vm.legalName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={rowLabel}>Account type</span><span style={rowValue}>{vm.type}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={rowLabel}>Email</span><span style={rowValue}>{vm.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={rowLabel}>Phone</span><span style={rowValue}>{vm.phone}</span>
          </div>
        </div>
      </div>

      {/* ACCREDITATION */}
      <div className="card" style={cardStyle}>
        <div className="tileEyebrow">ACCREDITATION</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <span style={{ width: 40, height: 40, borderRadius: '50%', flex: 'none', background: 'rgba(31,138,91,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={20} color="#1f8a5b" strokeWidth={2.4} />
          </span>
          {vm.accreditation.acknowledged ? (
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 700 }}>Acknowledged</div>
              <div style={{ fontSize: '.78rem', color: '#8b93a3' }}>Accredited investor · confirmed {vm.accreditation.confirmedDate}</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 700 }}>Not yet acknowledged</div>
            </div>
          )}
        </div>
      </div>

      {/* BANKING ON FILE */}
      <div className="card" style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tileEyebrow">BANKING ON FILE</div>
          <span className="linkBtn" onClick={() => openCompose('UPDATE_BANKING')}>Update ›</span>
        </div>
        {vm.banking ? (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={rowLabel}>Account</span><span className="mono" style={rowValue}>{vm.banking.display}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={rowLabel}>Method</span><span style={rowValue}>{vm.banking.method}</span>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16, fontSize: '.88rem', color: '#8b93a3' }}>No banking on file</div>
        )}
        <div className="quietNote" style={{ marginTop: 16 }}>
          Changes to banking are confirmed by phone before they take effect.
        </div>
      </div>

      {/* TAX & NOTIFICATIONS */}
      <div className="card" style={cardStyle}>
        <div className="tileEyebrow">TAX &amp; NOTIFICATIONS</div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={rowLabel}>Tax form</span><span style={rowValue}>Form W-9</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.82rem', color: '#0c1f3d', fontWeight: 500 }}>Distribution posted</span>
            <Toggle on={notif.distributionPosted} disabled={readOnly} onToggle={() => setPref('distributionPosted', !notif.distributionPosted)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.82rem', color: '#0c1f3d', fontWeight: 500 }}>Maturity reminders</span>
            <Toggle on={notif.maturityReminder} disabled={readOnly} onToggle={() => setPref('maturityReminder', !notif.maturityReminder)} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.82rem', color: '#0c1f3d', fontWeight: 500 }}>New message alerts</span>
            <Toggle on={notif.newMessage} disabled={readOnly} onToggle={() => setPref('newMessage', !notif.newMessage)} />
          </div>
        </div>
      </div>
    </div>
  );
}
