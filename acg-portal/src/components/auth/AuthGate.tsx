'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api-client';
import logoCream from '../../../public/acg-logo-cream.png';

type Role = 'INVESTOR' | 'TEAM';

export function AuthGate({ defaultEmail }: { defaultEmail?: string }) {
  const router = useRouter();

  const [role, setRole] = useState<Role>('INVESTOR');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [signinErr, setSigninErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setSigninErr('');
    setBusy(true);
    try {
      const res = await api.post<{ redirectTo: string }>('/api/auth/login', { email, password, role });
      router.push(res.redirectTo);
      router.refresh();
    } catch (e) {
      setSigninErr(e instanceof ApiError ? e.message : 'Could not sign in.');
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
          <div className="authTitle">Sign in</div>
          <div className="authSub">Private investor portal &amp; team console</div>

          <div className="segment" style={{ marginTop: 22 }}>
            <div className={`segmentItem${role === 'INVESTOR' ? ' active' : ''}`} onClick={() => setRole('INVESTOR')}>
              Investor
            </div>
            <div className={`segmentItem${role === 'TEAM' ? ' active' : ''}`} onClick={() => setRole('TEAM')}>
              Investor Relations
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <div className="fieldLabel">Email</div>
            <input
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && signIn()}
              autoComplete="username"
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="fieldLabel">Password</div>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && signIn()}
              autoComplete="current-password"
            />
          </div>

          {signinErr && <div className="formError">{signinErr}</div>}

          <button className="btnPrimary" style={{ width: '100%', marginTop: 22 }} onClick={signIn} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{ marginTop: 18, fontSize: '.76rem', color: '#9fb0cc', lineHeight: 1.5, textAlign: 'center' }}>
            Access is by invitation. Investor Relations creates your account and provides your
            initial email &amp; password — you&apos;ll set your own password on first sign-in.
          </div>
          <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.7rem', color: '#6c7a93' }}>
            Returns are fixed for the term — not guaranteed.
          </div>
        </div>
      </div>
    </div>
  );
}
