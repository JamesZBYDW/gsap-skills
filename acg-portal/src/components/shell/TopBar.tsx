'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '../Icon';
import { api } from '@/lib/api-client';

export function TopBar({
  eyebrow,
  title,
  side,
  dateText,
  hasUnread,
}: {
  eyebrow: string;
  title: string;
  side: 'investor' | 'team';
  dateText?: string;
  hasUnread?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div className="topbar">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="pageTitle">{title}</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {side === 'investor' ? (
          <span className="statusPill statusPill--ok">
            <span className="dot" />
            Note active
          </span>
        ) : (
          <div className="dateText">{dateText}</div>
        )}
        <button className="signOutBtn" onClick={signOut}>
          <Icon name="log-out" size={15} strokeWidth={1.8} />
          Sign out
        </button>
        <button className="bellBtn" aria-label="Notifications">
          <Icon name="bell" size={18} />
          {hasUnread && <span className="bellDot" />}
        </button>
      </div>
    </div>
  );
}
