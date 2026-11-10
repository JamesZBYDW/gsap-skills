'use client';

import { useEffect } from 'react';
import { Icon } from '../Icon';

export function SlideOver({
  onClose,
  header,
  children,
  zIndexClass,
}: {
  onClose: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
  /** Allow stacking (detail z-60 default, review z-75). */
  zIndexClass?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="slideOverWrap" style={zIndexClass ? { zIndex: zIndexClass } : undefined} role="dialog" aria-modal="true">
      <div className="overlay" onClick={onClose} />
      <div className="slideOver">
        <div
          style={{
            padding: '22px 26px',
            borderBottom: '1px solid var(--line-light)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>{header}</div>
          <button className="closeBtn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="acg-scroll" style={{ flex: 1, overflow: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
