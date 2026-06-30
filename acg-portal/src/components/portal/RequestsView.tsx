'use client';

import { useState } from 'react';
import type { RequestVM } from '@/server/portal';
import { useComposer } from '@/components/portal/ComposerProvider';
import { Pill } from '@/components/ui/Pill';
import { Icon } from '@/components/Icon';

const typeGlyph: Record<RequestVM['type'], string> = {
  ADD_CAPITAL: '＋',
  UPDATE_BANKING: '⛁',
  MATURITY_ELECTION: '↻',
  DOCUMENT: '▤',
  UPDATE_PROFILE: '⌂',
  NOTIF_PREFS: '◉',
  GENERAL: '•',
};

export function RequestsView({ requests }: { requests: RequestVM[] }) {
  const { openCompose } = useComposer();
  const [openId, setOpenId] = useState<string | null>(requests[0]?.id ?? null);

  return (
    <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Start a request */}
      <div className="card" style={{ padding: '22px 24px' }}>
        <div>
          <div style={{ fontSize: '.95rem', fontWeight: 700 }}>Start a request</div>
          <div style={{ fontSize: '.8rem', color: '#5b6473', marginTop: 2 }}>
            We&apos;ll confirm anything sensitive with you by phone before it takes effect.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 16 }}>
          <button className="chip chip--filled" onClick={() => openCompose('ADD_CAPITAL')}>
            <Icon name="plus" size={14} strokeWidth={2.2} />Add capital
          </button>
          <button className="chip chip--outline" onClick={() => openCompose('UPDATE_BANKING')}>Update banking</button>
          <button className="chip chip--outline" onClick={() => openCompose('MATURITY_ELECTION')}>Maturity election</button>
          <button className="chip chip--outline" onClick={() => openCompose('DOCUMENT')}>Request a document</button>
          <button className="chip chip--outline" onClick={() => openCompose('UPDATE_PROFILE')}>Update profile</button>
          <button className="chip chip--outline" onClick={() => openCompose('NOTIF_PREFS')}>Notification preferences</button>
        </div>
      </div>

      {/* Request list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {requests.map((r) => {
          const open = openId === r.id;
          return (
            <div key={r.id} className="card" style={{ overflow: 'hidden' }}>
              <div
                onClick={() => setOpenId(open ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px', cursor: 'pointer' }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    flex: 'none',
                    background: '#f4f1ea',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a87e45',
                    fontSize: '1.1rem',
                  }}
                >
                  {typeGlyph[r.type]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#a87e45' }}>
                    {r.typeLabel}
                  </div>
                  <div style={{ fontSize: '.96rem', fontWeight: 700, marginTop: 2 }}>{r.title}</div>
                </div>
                <Pill tone={r.tone}>{r.statusLabel}</Pill>
                <div style={{ fontSize: '.78rem', color: '#9aa1ad', width: 96, textAlign: 'right' }}>{r.date}</div>
              </div>
              {open && (
                <div style={{ padding: '4px 22px 20px 78px', borderTop: '1px solid rgba(12,31,61,.06)' }}>
                  {r.detail && (
                    <div style={{ fontSize: '.84rem', color: '#5b6473', margin: '14px 0 2px' }}>{r.detail}</div>
                  )}
                  {r.note && <div className="amberNote" style={{ margin: '12px 0 4px' }}>{r.note}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 14 }}>
                    {r.history.map((h, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '0 0 16px' }}>
                        <span
                          style={
                            h.done
                              ? { width: 13, height: 13, borderRadius: '50%', flex: 'none', background: '#1f8a5b', boxShadow: '0 0 0 3px rgba(31,138,91,.15)' }
                              : { width: 13, height: 13, borderRadius: '50%', flex: 'none', background: '#fff', border: '2px solid #c9cdd6' }
                          }
                        />
                        <div style={{ marginTop: -2 }}>
                          <div style={h.done ? { fontSize: '.82rem', color: '#0c1f3d', fontWeight: 600 } : { fontSize: '.82rem', color: '#9aa1ad' }}>
                            {h.label}
                          </div>
                          <div style={{ fontSize: '.74rem', color: '#9aa1ad' }}>{h.date}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
