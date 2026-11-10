'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { PASSWORD_HINT, passwordPolicyError } from '@/lib/password-policy';

export function EmailPasswordForm({ mode }: { mode: 'request' | 'set' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (mode === 'set') {
      const supplied = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (supplied) {
        setToken(supplied);
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
    }
  }, [mode]);
  const recovery = mode === 'request';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (!recovery) {
      const problem = passwordPolicyError(password) ?? (password !== confirm ? 'Passwords do not match.' : '');
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    try {
      if (recovery) await api.post('/api/auth/forgot-password', { email });
      else await api.post('/api/auth/reset-password', { newPassword: password, token });
      setToken('');
      setPassword('');
      setConfirm('');
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="authBackdrop">
      <div className="authCard" style={{ width: 424, maxWidth: '94vw' }}>
        <h1 className="authTitle">{recovery ? 'Reset your password' : 'Set your password'}</h1>
        {done ? (
          <p role="status" className="authSub">
            {recovery
              ? 'If that email has a portal account, a password link will arrive shortly.'
              : 'Your password is ready. Sign in to continue.'}
          </p>
        ) : (
          <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
            {recovery ? (
              <label className="fieldLabel">
                Login email
                <input
                  className="field"
                  type="email"
                  autoComplete="username"
                  value={email}
                  required
                  maxLength={320}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="fieldLabel">
                  New password
                  <input
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    required
                    maxLength={200}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="fieldLabel">
                  Confirm new password
                  <input
                    className="field"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    required
                    maxLength={200}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
                <div className="authSub">{PASSWORD_HINT}</div>
                {!token && <Link href="/forgot-password">Request a new password link</Link>}
              </>
            )}
            {error && (
              <p className="formError" role="alert">
                {error}
              </p>
            )}
            <button className="btnPrimary" disabled={busy || (!recovery && !token)}>
              {busy ? 'Please wait…' : recovery ? 'Email password link' : 'Save password'}
            </button>
          </form>
        )}
        <p style={{ marginTop: 18, textAlign: 'center', color: '#bfcee4' }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
