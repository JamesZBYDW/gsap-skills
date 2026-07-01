'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api-client';
import logoCream from '../../../public/acg-logo-cream.png';

// Shown once, on an investor's first sign-in with a management-issued password.
export function ForcedPasswordChange() {
  const router = useRouter();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    if (next !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ redirectTo: string }>('/api/auth/first-password', { newPassword: next });
      router.push(res.redirectTo);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not set password.');
      setBusy(false);
    }
  }

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
          <div className="authTitle">Set your password</div>
          <div className="authSub">Choose a new password to finish signing in for the first time.</div>

          <div style={{ marginTop: 20 }}>
            <div className="fieldLabel">New password</div>
            <input
              className="field"
              data-testid="fp-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="fieldLabel">Confirm new password</div>
            <input
              className="field"
              data-testid="fp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          {err && <div className="formError">{err}</div>}

          <button
            className="btnPrimary"
            data-testid="fp-submit"
            style={{ width: '100%', marginTop: 22 }}
            onClick={submit}
            disabled={busy || next.length < 10 || !confirm}
          >
            {busy ? 'Saving…' : 'Set password & continue'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 16, fontSize: '.74rem', color: '#6c7a93' }}>
            At least 10 characters, with letters and numbers.
          </div>
        </div>
      </div>
    </div>
  );
}
