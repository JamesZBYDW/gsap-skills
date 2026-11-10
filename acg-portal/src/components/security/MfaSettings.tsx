'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';

export interface MfaSettingsVM {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

const cardStyle: React.CSSProperties = { padding: '24px 26px' };
const note: React.CSSProperties = { fontSize: '.82rem', color: '#5d6b82', lineHeight: 1.55 };

type Mode = 'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regenerate';

export function MfaSettings({ vm, readOnly, readOnlyNote }: { vm: MfaSettingsVM; readOnly: boolean; readOnlyNote?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    // Clear sensitive values whenever the step changes.
    setErr('');
  }, [mode]);

  function reset(next: Mode = 'idle') {
    setPassword('');
    setCode('');
    if (next !== 'scan') {
      setSecret('');
      setQr('');
    }
    setMode(next);
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setErr('');
    try {
      return await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    const res = await run(() => api.post<{ secret: string; otpauthUri: string }>('/api/mfa/enroll/start', { password }));
    if (!res) return;
    setSecret(res.secret);
    setQr(await QRCode.toString(res.otpauthUri, { type: 'svg', margin: 1, width: 180 }));
    setPassword('');
    setMode('scan');
  }

  async function confirm() {
    const res = await run(() => api.post<{ recoveryCodes: string[] }>('/api/mfa/enroll/confirm', { code }));
    if (!res) return;
    setCodes(res.recoveryCodes);
    reset('codes');
    toast('Two-factor authentication is on');
  }

  async function disable() {
    const res = await run(() => api.post('/api/mfa/disable', { password, code }));
    if (res === null) return;
    reset();
    toast('Two-factor authentication is off');
    router.refresh();
  }

  async function regenerate() {
    const res = await run(() => api.post<{ recoveryCodes: string[] }>('/api/mfa/recovery-codes', { password, code }));
    if (!res) return;
    setCodes(res.recoveryCodes);
    reset('codes');
    toast('New recovery codes created');
  }

  const status = vm.enabled ? 'On' : 'Off';

  return (
    <div className="content" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 640px)', gap: 18 }}>
      <div className="card" style={cardStyle}>
        <div className="tileEyebrow">TWO-FACTOR AUTHENTICATION</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div style={{ fontSize: '.95rem', fontWeight: 700 }}>Authenticator app</div>
          <span className={`pill pill--${vm.enabled ? 'ok' : 'mute'}`} data-testid="mfa-status">
            {status}
          </span>
        </div>
        <div style={{ ...note, marginTop: 10 }}>
          After your password, sign-in asks for a 6-digit code from an authenticator app (such as 1Password, Google
          Authenticator or Microsoft Authenticator).
          {vm.enabled && (
            <>
              {' '}
              Recovery codes left: <strong data-testid="mfa-recovery-remaining">{vm.recoveryCodesRemaining}</strong>.
            </>
          )}
        </div>

        {readOnly && (
          <div className="quietNote" style={{ marginTop: 16 }}>
            {readOnlyNote ?? 'Read-only view. Only the account holder can change two-factor settings.'}
          </div>
        )}

        {!readOnly && mode === 'idle' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            {!vm.enabled && (
              <button className="btnPrimary" data-testid="mfa-enable" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={() => reset('password')}>
                Turn on
              </button>
            )}
            {vm.enabled && (
              <>
                <button className="btnPrimary" data-testid="mfa-regenerate" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={() => reset('regenerate')}>
                  New recovery codes
                </button>
                <button className="btnGhost" data-testid="mfa-disable" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={() => reset('disable')}>
                  Turn off
                </button>
              </>
            )}
          </div>
        )}

        {!readOnly && mode === 'password' && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
            <div>
              <div className="fieldLabel" style={{ color: '#8b93a3' }}>Confirm your password</div>
              <input className="fieldLight" data-testid="mfa-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btnPrimary" data-testid="mfa-start" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} disabled={busy || !password} onClick={start}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
              <button className="btnGhost" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={() => reset()}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!readOnly && mode === 'scan' && (
          <div style={{ marginTop: 18, display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="QR code for your authenticator app"
                width={180}
                height={180}
                src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`}
                style={{ border: '1px solid rgba(12,31,61,.1)', borderRadius: 10 }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
              <div style={note}>
                Scan the code with your authenticator app, or enter this key manually:
                <div className="mono" data-testid="mfa-secret" style={{ marginTop: 6, fontWeight: 600, wordBreak: 'break-all', color: '#0c1f3d' }}>
                  {secret.replace(/(.{4})/g, '$1 ').trim()}
                </div>
              </div>
              <div>
                <div className="fieldLabel" style={{ color: '#8b93a3' }}>6-digit code from the app</div>
                <input className="fieldLight" data-testid="mfa-confirm-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btnPrimary" data-testid="mfa-confirm" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} disabled={busy || !/^\d{6}$/.test(code.trim())} onClick={confirm}>
                  {busy ? 'Verifying…' : 'Verify & turn on'}
                </button>
                <button className="btnGhost" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={() => reset()}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!readOnly && (mode === 'disable' || mode === 'regenerate') && (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
            <div style={note}>
              {mode === 'disable'
                ? 'To turn off two-factor authentication, confirm your password and a current code (or a recovery code).'
                : 'Your existing recovery codes will stop working. Confirm your password and a current code.'}
            </div>
            <div>
              <div className="fieldLabel" style={{ color: '#8b93a3' }}>Password</div>
              <input className="fieldLight" data-testid="mfa-reauth-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <div className="fieldLabel" style={{ color: '#8b93a3' }}>Code from the app, or a recovery code</div>
              <input className="fieldLight" data-testid="mfa-reauth-code" autoComplete="one-time-code" maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btnPrimary"
                data-testid="mfa-reauth-submit"
                style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }}
                disabled={busy || !password || !code.trim()}
                onClick={mode === 'disable' ? disable : regenerate}
              >
                {busy ? 'Checking…' : mode === 'disable' ? 'Turn off' : 'Create new codes'}
              </button>
              <button className="btnGhost" style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10 }} onClick={() => reset()}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!readOnly && mode === 'codes' && (
          <div style={{ marginTop: 18 }}>
            <div style={note}>
              Save these recovery codes somewhere safe. Each one signs you in once if you lose your device. They will not be
              shown again.
            </div>
            <div
              className="mono"
              data-testid="mfa-recovery-codes"
              style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, max-content)', gap: '6px 28px', fontWeight: 600, color: '#0c1f3d' }}
            >
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <button
              className="btnPrimary"
              data-testid="mfa-codes-done"
              style={{ padding: '10px 18px', fontSize: '.84rem', borderRadius: 10, marginTop: 16 }}
              onClick={() => {
                setCodes([]);
                reset();
                router.refresh();
              }}
            >
              I have saved these codes
            </button>
          </div>
        )}

        {err && (
          <div className="formError" data-testid="mfa-settings-error" style={{ marginTop: 14 }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
