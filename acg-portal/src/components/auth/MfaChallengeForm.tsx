'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api-client';
import logoCream from '../../../public/acg-logo-cream.png';

// Second sign-in step for accounts with two-factor authentication on.
export function MfaChallengeForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      const res = await api.post<{ redirectTo: string }>('/api/auth/mfa/verify', { code });
      router.push(res.redirectTo);
      router.refresh();
    } catch (e) {
      setBusy(false);
      setCode('');
      if (e instanceof ApiError && e.status === 401) {
        setErr(e.message);
        setTimeout(() => router.push('/login'), 1200);
        return;
      }
      setErr(e instanceof ApiError ? e.message : 'Could not verify the code.');
    }
  }

  const ready = recovery ? code.trim().length >= 10 : /^\d{6}$/.test(code.replace(/\s/g, ''));

  return (
    <div className="authBackdrop">
      <div style={{ width: 424, maxWidth: '94vw' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Image src={logoCream} alt="ACG" height={34} style={{ width: 'auto', display: 'inline-block' }} priority />
          <div style={{ marginTop: 12, fontSize: '.62rem', fontWeight: 700, letterSpacing: '.24em', color: '#c8a878' }}>
            AMSTERDAM CAPITAL GROUP
          </div>
        </div>

        <div className="authCard">
          <div className="authTitle">Two-step verification</div>
          <div className="authSub">
            {recovery
              ? 'Enter one of your recovery codes. Each code works only once.'
              : 'Enter the 6-digit code from your authenticator app.'}
          </div>

          <div style={{ marginTop: 20 }}>
            <div className="fieldLabel">{recovery ? 'Recovery code' : 'Authentication code'}</div>
            <input
              className="field"
              data-testid="mfa-code"
              autoFocus
              inputMode={recovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              maxLength={recovery ? 20 : 7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ready && !busy && submit()}
            />
          </div>

          {err && (
            <div className="formError" data-testid="mfa-error">
              {err}
            </div>
          )}

          <button className="btnPrimary" data-testid="mfa-submit" style={{ width: '100%', marginTop: 22 }} onClick={submit} disabled={busy || !ready}>
            {busy ? 'Verifying…' : 'Verify & sign in'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: '.76rem' }}>
            <button
              type="button"
              data-testid="mfa-toggle-recovery"
              onClick={() => {
                setRecovery(!recovery);
                setCode('');
                setErr('');
              }}
              style={{ background: 'none', border: 0, color: '#9fb0cc', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {recovery ? 'Use the authenticator app instead' : 'Lost your device? Use a recovery code'}
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: '.72rem' }}>
            <a href="/login" style={{ color: '#6c7a93' }}>
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
