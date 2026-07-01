'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProfileVM } from '@/server/portal';
import { Toggle } from '@/components/ui/Toggle';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

type NotifKey = 'distributionPosted' | 'maturityReminder';

const rowLabel: React.CSSProperties = { fontSize: '.82rem', color: '#8b93a3' };
const rowValue: React.CSSProperties = { fontSize: '.88rem', fontWeight: 600 };
const cardStyle: React.CSSProperties = { padding: '24px 26px' };

export function ProfileView({ vm, readOnly }: { vm: ProfileVM; readOnly: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [notif, setNotif] = useState(vm.notif);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

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

  async function changePassword() {
    if (readOnly) return;
    setPwBusy(true);
    try {
      await api.post('/api/profile/password', { currentPassword: cur, newPassword: next });
      setCur('');
      setNext('');
      toast('Password updated');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not update password');
    } finally {
      setPwBusy(false);
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
        <div className="tileEyebrow">BANKING ON FILE</div>
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
          To change banking, contact Investor Relations — changes are confirmed by phone before they take effect.
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
        </div>
      </div>

      {/* SECURITY — change password */}
      <div className="card" style={cardStyle}>
        <div className="tileEyebrow">SECURITY</div>
        <div style={{ fontSize: '.9rem', fontWeight: 700, marginTop: 14 }}>Change password</div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <div>
            <div className="fieldLabel" style={{ color: '#8b93a3' }}>Current password</div>
            <input className="fieldLight" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <div className="fieldLabel" style={{ color: '#8b93a3' }}>New password</div>
            <input className="fieldLight" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={readOnly} />
          </div>
          <button
            className="btnPrimary"
            style={{ alignSelf: 'flex-start', padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }}
            onClick={changePassword}
            disabled={readOnly || pwBusy || !cur || next.length < 10}
          >
            {pwBusy ? 'Updating…' : 'Update password'}
          </button>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>At least 10 characters, with letters and numbers.</div>
        </div>
      </div>
    </div>
  );
}
