'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '../Icon';
import { useToast } from '../ui/Toast';
import { api, ApiError } from '@/lib/api-client';
import { TERM_OPTIONS } from '@/lib/rates';
import logoCream from '../../../public/acg-logo-cream.png';

type Screen = 'signin' | 'register';
type Role = 'INVESTOR' | 'TEAM';
type AccountType = 'INDIVIDUAL' | 'ENTITY';

export function AuthGate({ defaultEmail }: { defaultEmail?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>('signin');

  // Sign in
  const [role, setRole] = useState<Role>('INVESTOR');
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [password, setPassword] = useState('');
  const [signinErr, setSigninErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Register
  const [rgName, setRgName] = useState('');
  const [rgEmail, setRgEmail] = useState('');
  const [rgType, setRgType] = useState<AccountType>('INDIVIDUAL');
  const [rgPrincipal, setRgPrincipal] = useState('');
  const [rgTerm, setRgTerm] = useState(24);
  const [rgAck, setRgAck] = useState(false);
  const [rgErr, setRgErr] = useState('');

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

  async function submitRegister() {
    setRgErr('');
    if (!rgName.trim() || !rgEmail.trim() || !rgAck) {
      setRgErr('Please add name, email and confirm accreditation.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/register', {
        name: rgName,
        email: rgEmail,
        type: rgType,
        principal: rgPrincipal,
        termMonths: rgTerm,
        acknowledgedAccredited: rgAck,
      });
      setScreen('signin');
      setRgName(''); setRgEmail(''); setRgPrincipal(''); setRgType('INDIVIDUAL'); setRgTerm(24); setRgAck(false);
      toast('Registration submitted — our team will review and email you');
    } catch (e) {
      setRgErr(e instanceof ApiError ? e.message : 'Could not submit.');
    } finally {
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
          {screen === 'signin' ? (
            <>
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

              <div style={{ textAlign: 'center', marginTop: 18, fontSize: '.8rem', color: '#9fb0cc' }}>
                Accredited investors only ·{' '}
                <span className="authFootLink" onClick={() => setScreen('register')}>
                  Request access ›
                </span>
              </div>
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.7rem', color: '#6c7a93' }}>
                Returns are fixed for the term — not guaranteed.
              </div>
            </>
          ) : (
            <>
              <div className="authTitle">Request access</div>
              <div className="authSub">Register your interest in the ACG Promissory Note</div>

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 13 }}>
                <div>
                  <div className="fieldLabel">Legal name</div>
                  <input className="field" placeholder="Full legal name or entity" value={rgName} onChange={(e) => setRgName(e.target.value)} />
                </div>
                <div>
                  <div className="fieldLabel">Email</div>
                  <input className="field" placeholder="you@example.com" value={rgEmail} onChange={(e) => setRgEmail(e.target.value)} />
                </div>
                <div>
                  <div className="fieldLabel">Account type</div>
                  <div className="segment" style={{ borderRadius: 9 }}>
                    <div className={`segmentItem${rgType === 'INDIVIDUAL' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem' }} onClick={() => setRgType('INDIVIDUAL')}>
                      Individual
                    </div>
                    <div className={`segmentItem${rgType === 'ENTITY' ? ' active' : ''}`} style={{ padding: 9, borderRadius: 8, fontSize: '.8rem' }} onClick={() => setRgType('ENTITY')}>
                      Entity
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div className="fieldLabel">Intended principal</div>
                    <input className="field" placeholder="250,000" value={rgPrincipal} onChange={(e) => setRgPrincipal(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="fieldLabel">Term</div>
                    <select className="field" value={rgTerm} onChange={(e) => setRgTerm(Number(e.target.value))} style={{ appearance: 'none' }}>
                      {TERM_OPTIONS.map((t) => (
                        <option key={t.months} value={t.months} style={{ color: '#0c1f3d' }}>
                          {t.label} · {t.rateBps / 100}%
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div onClick={() => setRgAck(!rgAck)} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, cursor: 'pointer', marginTop: 2 }}>
                  <span className={`ackBox${rgAck ? ' checked' : ''}`}>
                    {rgAck && <Icon name="check" size={13} color="#fff" strokeWidth={3} />}
                  </span>
                  <span style={{ fontSize: '.78rem', color: '#cdd6e6', lineHeight: 1.45 }}>
                    I confirm I am an accredited investor.
                  </span>
                </div>
              </div>

              {rgErr && <div className="formError">{rgErr}</div>}

              <button className="btnPrimary" style={{ width: '100%', marginTop: 20, fontSize: '.9rem' }} onClick={submitRegister} disabled={busy}>
                Submit registration
              </button>
              <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.8rem', color: '#9fb0cc' }}>
                <span className="authFootLink" onClick={() => setScreen('signin')}>
                  ‹ Back to sign in
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
