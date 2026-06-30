'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/ui/Modal';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import type { ThreadVM } from '@/server/team';

export function TeamMessagesView({ threads }: { threads: ThreadVM[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(threads[0]?.investorId ?? null);
  const [draft, setDraft] = useState('');
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Keep selection by investorId across refreshes; fall back to first thread.
  const selected =
    threads.find((t) => t.investorId === selectedId) ?? threads[0] ?? null;

  // Auto-scroll to bottom on mount and whenever selection/messages change.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected?.investorId, selected?.messages]);

  async function selectThread(t: ThreadVM) {
    setSelectedId(t.investorId);
    if (t.unread > 0) {
      try {
        await api.post(`/api/team/threads/${t.investorId}/read`);
        router.refresh();
      } catch (err) {
        toast(err instanceof ApiError ? err.message : 'Request failed. Please try again.');
      }
    }
  }

  async function send() {
    if (!selected) return;
    const text = draft.trim();
    if (!text) return;
    try {
      await api.post(`/api/team/threads/${selected.investorId}/messages`, { text });
      setDraft('');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Request failed. Please try again.');
    }
  }

  async function sendBroadcast() {
    const text = broadcastText.trim();
    if (!text) return;
    try {
      await api.post('/api/team/broadcast', { text });
      toast('Broadcast sent to investors');
      setBroadcastOpen(false);
      setBroadcastText('');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Request failed. Please try again.');
    }
  }

  const firstName = selected ? selected.investorName.split(' ')[0] : '';

  return (
    <div style={{ height: '100%', display: 'flex' }}>
      {/* LEFT — conversations */}
      <div
        style={{
          width: 300,
          flex: 'none',
          borderRight: '1px solid rgba(12,31,61,.08)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(12,31,61,.07)',
          }}
        >
          <div style={{ fontSize: '.62rem', fontWeight: 700, letterSpacing: '.14em', color: '#a87e45' }}>
            CONVERSATIONS
          </div>
          <button
            className="linkBtn"
            onClick={() => setBroadcastOpen(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="broadcast" size={13} strokeWidth={2} />
            Broadcast
          </button>
        </div>
        <div className="acg-scroll" style={{ flex: 1, overflow: 'auto', padding: 10 }}>
          {threads.map((t) => (
            <div
              key={t.investorId}
              className={`threadRow${selected?.investorId === t.investorId ? ' active' : ''}`}
              onClick={() => selectThread(t)}
            >
              <div className="threadAvatar">{t.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span
                    style={{
                      fontSize: '.84rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.investorName}
                  </span>
                  <span style={{ fontSize: '.7rem', color: '#9aa1ad', flex: 'none' }}>{t.time}</span>
                </div>
                <div
                  style={{
                    fontSize: '.76rem',
                    color: '#8b93a3',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2,
                  }}
                >
                  {t.last}
                </div>
              </div>
              {t.unread > 0 && <span className="threadUnread">{t.unread}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — thread */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {selected ? (
          <>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(12,31,61,.07)' }}>
              <div style={{ fontSize: '.92rem', fontWeight: 700 }}>{selected.investorName}</div>
              <div style={{ fontSize: '.74rem', color: '#8b93a3' }}>
                {selected.type} · {selected.stateLabel} note · {selected.principal}
              </div>
            </div>
            <div
              ref={listRef}
              className="acg-scroll"
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {selected.messages.map((m) => {
                const mine = m.author === 'TEAM';
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
                      <div style={{ fontSize: '.86rem', lineHeight: 1.5 }}>{m.text}</div>
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
            <div
              style={{
                flex: 'none',
                padding: '12px 24px 18px',
                borderTop: '1px solid rgba(12,31,61,.07)',
              }}
            >
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
                  placeholder={`Reply to ${firstName}…`}
                />
                <button className="sendBtn" onClick={send} aria-label="Send">
                  <Icon name="send" size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#8b93a3',
              fontSize: '.9rem',
            }}
          >
            No conversations yet.
          </div>
        )}
      </div>

      {/* BROADCAST MODAL */}
      {broadcastOpen && (
        <Modal
          title="Broadcast to investors"
          onClose={() => setBroadcastOpen(false)}
          footer={
            <>
              <button className="btnGhost" onClick={() => setBroadcastOpen(false)}>
                Cancel
              </button>
              <button className="btnPrimary" onClick={sendBroadcast}>
                Send broadcast
              </button>
            </>
          }
        >
          <div>
            <div className="fieldLabelGold">MESSAGE TO ALL ACTIVE INVESTORS</div>
            <textarea
              className="fieldLight"
              value={broadcastText}
              onChange={(e) => setBroadcastText(e.target.value)}
              placeholder="e.g. June distributions have posted to all active notes…"
              style={{ minHeight: 110 }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
