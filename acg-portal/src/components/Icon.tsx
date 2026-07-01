import type { CSSProperties } from 'react';

// Feather-style stroke icons, extracted 1:1 from the design prototype. All use
// currentColor so they inherit text color; round caps/joins throughout.

export type IconName =
  | 'grid'
  | 'calendar'
  | 'tray'
  | 'message'
  | 'file'
  | 'user'
  | 'users'
  | 'user-plus'
  | 'search'
  | 'plus'
  | 'building'
  | 'download'
  | 'send'
  | 'check'
  | 'x'
  | 'chevron-right'
  | 'arrow-right'
  | 'arrow-left'
  | 'log-out'
  | 'broadcast'
  | 'lines';

const PATHS: Record<IconName, { sw: number; body: React.ReactNode }> = {
  grid: {
    sw: 1.7,
    body: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  calendar: {
    sw: 1.7,
    body: (
      <>
        <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      </>
    ),
  },
  tray: {
    sw: 1.7,
    body: (
      <>
        <path d="M21 14l-2.5-8.5A2 2 0 0 0 16.6 4H7.4a2 2 0 0 0-1.9 1.5L3 14" />
        <path d="M3 14h5a2 2 0 0 0 4 0 2 2 0 0 0 4 0h5v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </>
    ),
  },
  message: {
    sw: 1.7,
    body: <path d="M21 11.5a8 8 0 0 1-11.7 7.1L3 20.5l1.9-6.2A8 8 0 1 1 21 11.5z" />,
  },
  file: {
    sw: 1.7,
    body: (
      <>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
  user: {
    sw: 1.7,
    body: (
      <>
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20c0-3.6 3.1-5.4 7-5.4s7 1.8 7 5.4" />
      </>
    ),
  },
  users: {
    sw: 1.7,
    body: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20c0-3.4 2.9-5 6.5-5" />
        <circle cx="17" cy="9" r="2.6" />
        <path d="M14 19.5c.3-2.4 2-3.7 4-3.7 2.2 0 3.5 1.4 3.5 3.7" />
      </>
    ),
  },
  'user-plus': {
    sw: 1.7,
    body: (
      <>
        <circle cx="9" cy="8" r="3.4" />
        <path d="M3 20c0-3.4 2.7-5 6-5" />
        <path d="M17 9v6M14 12h6" />
      </>
    ),
  },
  search: {
    sw: 2,
    body: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </>
    ),
  },
  plus: { sw: 2.2, body: <path d="M12 5v14M5 12h14" /> },
  building: {
    sw: 1.9,
    body: <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />,
  },
  download: { sw: 1.8, body: <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" /> },
  send: { sw: 2, body: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /> },
  check: { sw: 2.4, body: <path d="M4 12l5 5L20 6" /> },
  x: { sw: 2, body: <path d="M6 6l12 12M18 6L6 18" /> },
  'chevron-right': { sw: 2, body: <path d="M9 6l6 6-6 6" /> },
  'arrow-right': { sw: 2, body: <path d="M5 12h14M13 6l6 6-6 6" /> },
  'arrow-left': { sw: 2, body: <path d="M19 12H5M11 6l-6 6 6 6" /> },
  'log-out': {
    sw: 1.8,
    body: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  },
  broadcast: { sw: 2, body: <path d="M3 8h15l-4-4M3 8l4 4M21 16H6l4 4M21 16l-4-4" /> },
  lines: { sw: 2, body: <path d="M3 6h18M3 12h18M3 18h12" /> },
};

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 18, strokeWidth, color = 'currentColor', style, className }: IconProps) {
  const def = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth ?? def.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {def.body}
    </svg>
  );
}
