'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { toISODate } from '@/lib/dates';
import { formatUSD } from '@/lib/money';
import type { PaymentSchedule } from '@/server/payments';

export function TeamPayments({ investorId }: { investorId: string }) {
  const router = useRouter();
  const url = `/api/team/investors/${encodeURIComponent(investorId)}/payments`;
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [distributionId, setDistributionId] = useState('');
  const [paidDate, setPaidDate] = useState(() => toISODate(new Date()));
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let current = true;
    setSchedule(null);
    setLoadError('');
    api.get<PaymentSchedule>(url).then((result) => {
      if (current) setSchedule(result);
    }).catch((err: unknown) => {
      if (current) setLoadError(err instanceof ApiError ? err.message : 'Could not load distributions.');
    });
    return () => { current = false; };
  }, [url, revision]);

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    if (busy || !distributionId) return;
    setBusy(true);
    setFeedback('');
    try {
      const result = await api.post<{ recorded: boolean }>(url, { distributionId, paidDate, reference });
      setFeedback(result.recorded ? 'Payment recorded.' : 'This payment was already recorded.');
      setDistributionId('');
      setReference('');
      setRevision((value) => value + 1);
      router.refresh();
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : 'Could not record the payment. Try again.');
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        setDistributionId('');
        setRevision((value) => value + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  const paid = schedule?.distributions.filter((item) => item.paidDate) ?? [];
  const unpaid = schedule?.distributions.filter((item) => !item.paidDate) ?? [];
  return (
    <section className="card" aria-label="Distribution payments" style={{ padding: '18px 20px' }}>
      <div className="tileEyebrow">DISTRIBUTION PAYMENTS</div>
      {loadError && <p role="alert">{loadError} <button type="button" className="linkBtn" onClick={() => setRevision((v) => v + 1)}>Retry</button></p>}
      {!schedule && !loadError && <p role="status">Loading distributions…</p>}
      {schedule && !schedule.distributions.length && <p>No scheduled distributions yet.</p>}
      {schedule && schedule.distributions.length > 0 && (
        <>
          <p data-testid="payment-total"><strong>{formatUSD(schedule.paidTotalCents)}</strong> recorded across {paid.length} of {schedule.distributions.length} distributions</p>
          {unpaid.length > 0 && (
            <form onSubmit={recordPayment} style={{ display: 'grid', gap: 12 }}>
              <label className="fieldLabel">Scheduled distribution
                <select className="fieldLight" data-testid="payment-distribution" value={distributionId} onChange={(e) => setDistributionId(e.target.value)} required disabled={busy}>
                  <option value="">Choose a distribution</option>
                  {unpaid.map((d) => <option key={d.id} value={d.id}>#{d.index} · {d.dueDate} · {formatUSD(d.amountCents)}</option>)}
                </select>
              </label>
              <label className="fieldLabel">Date paid
                <input className="fieldLight" data-testid="payment-date" type="date" max={toISODate(new Date())} value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required disabled={busy} />
              </label>
              <label className="fieldLabel">Payment reference
                <input className="fieldLight" data-testid="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} required disabled={busy} />
              </label>
              <div className="quietNote">Record the full scheduled amount once paid. Note edits must preserve each recorded distribution’s number, due date and amount.</div>
              <button className="btnPrimary" data-testid="payment-record" disabled={busy || !distributionId || !paidDate || !reference.trim()}>
                {busy ? 'Recording…' : 'Record payment'}
              </button>
            </form>
          )}
          {paid.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary>Recorded payments ({paid.length})</summary>
              <ul style={{ paddingLeft: 20 }}>
                {paid.map((p) => <li key={p.id}>#{p.index} · {formatUSD(p.amountCents)} · Paid {p.paidDate}{p.reference ? ` · ${p.reference}` : ''}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
