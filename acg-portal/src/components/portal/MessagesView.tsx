'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import type { MessageVM } from '@/server/portal';

export function MessagesView({ messages, readOnly }: { messages: MessageVM[]; readOnly: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    if (readOnly) {
      toast('Read-only view');
      return;
    }
    try {
      await api.post('/api/messages', { text });
      setDraft('');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Request failed. Please try again.');
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        ref={listRef}
        className="acg-scroll"
        style={{ flex: 1, overflow: 'auto', padding: '26px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ textAlign: 'center', fontSize: '.72rem', color: '#9aa1ad', fontWeight: 600 }}>
          Investor Relations · typically replies within a day
        </div>
        {messages.map((m) => {
          const mine = m.author === 'INVESTOR';
          return (
            <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div className={`bubble ${mine ? 'bubble--mine' : 'bubble--theirs'}`}>
                <div
                  style={{
                    fontSize: '.68rem',
                    fontWeight: 700,
                    color: mine ? 'rgba(255,255,255,.7)' : '#a87e45',
                  }}
                >
                  {m.authorName}
                </div>
                <div style={{ fontSize: '.88rem', lineHeight: 1.5 }}>{m.text}</div>
                <div
                  style={{
                    fontSize: '.66rem',
                    marginTop: 6,
                    color: mine ? 'rgba(255,255,255,.6)' : '#9aa1ad',
                  }}
                >
                  {m.time}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ flex: 'none', padding: '14px 34px 22px', borderTop: '1px solid rgba(12,31,61,.07)', background: '#faf7f0' }}>
        <div className="composerBar">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message to Investor Relations…"
            disabled={readOnly}
          />
          <button className="sendBtn" onClick={send} disabled={readOnly} aria-label="Send">
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
