'use client';

import { useEffect } from 'react';
import { Icon } from '../Icon';

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modalWrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="overlay overlay--modal" onClick={onClose} />
      <div className="modal">
        <div className="modalHeader">
          <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{title}</div>
          <button className="closeBtn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={17} />
          </button>
        </div>
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: '0 24px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
