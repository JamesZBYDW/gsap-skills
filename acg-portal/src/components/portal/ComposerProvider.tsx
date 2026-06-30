'use client';

import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RequestType } from '@prisma/client';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { api, ApiError } from '@/lib/api-client';
import { requestTypeLabel } from '@/lib/labels';

interface ComposerContextValue {
  openCompose: (type: RequestType) => void;
  readOnly: boolean;
}

const ComposerContext = createContext<ComposerContextValue | null>(null);

export function ComposerProvider({ readOnly, children }: { readOnly: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [type, setType] = useState<RequestType | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  function openCompose(t: RequestType) {
    if (readOnly) {
      toast('Read-only view — sign in as the investor to submit requests');
      return;
    }
    setType(t);
    setDetail('');
  }

  function close() {
    setType(null);
    setBusy(false);
  }

  async function submit() {
    if (!type) return;
    setBusy(true);
    try {
      await api.post('/api/requests', { type, detail });
      close();
      toast('Request submitted to Investor Relations');
      router.push('/portal/requests');
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Could not submit request');
      setBusy(false);
    }
  }

  return (
    <ComposerContext.Provider value={{ openCompose, readOnly }}>
      {children}
      {type && (
        <Modal
          title="New request"
          onClose={close}
          footer={
            <>
              <button className="btnGhost" onClick={close}>Cancel</button>
              <button className="btnPrimary" style={{ padding: '11px 22px', fontSize: '.84rem', borderRadius: 10 }} onClick={submit} disabled={busy}>
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </>
          }
        >
          <div>
            <div className="fieldLabelGold">Request type</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', fontSize: '.84rem', fontWeight: 700, color: 'var(--navy-ink)', background: '#fff', border: '1px solid rgba(12,31,61,.12)', padding: '8px 14px', borderRadius: 10 }}>
              {requestTypeLabel[type]}
            </div>
          </div>
          <div>
            <div className="fieldLabelGold">Details</div>
            <textarea
              className="fieldLight"
              placeholder="Add anything Investor Relations should know…"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
          <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
            We&apos;ll review and follow up. Anything sensitive is confirmed by phone first.
          </div>
        </Modal>
      )}
    </ComposerContext.Provider>
  );
}

export function useComposer(): ComposerContextValue {
  const ctx = useContext(ComposerContext);
  if (!ctx) return { openCompose: () => {}, readOnly: false };
  return ctx;
}
