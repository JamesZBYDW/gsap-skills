import { Sidebar, type NavItemData, type SidebarFooter } from './Sidebar';
import { TopBar } from './TopBar';

// Server component frame: navy sidebar + ivory main with a fixed top bar and a
// scrollable content region. `scroll` lets full-height views (Messages) manage
// their own scrolling instead of the default content padding.
export function AppShell({
  side,
  portalLabel,
  nav,
  footer,
  eyebrow,
  title,
  dateText,
  hasUnread,
  children,
  fill,
  readOnlyLabel,
}: {
  side: 'investor' | 'team';
  portalLabel: string;
  nav: NavItemData[];
  footer: SidebarFooter;
  eyebrow: string;
  title: string;
  dateText?: string;
  hasUnread?: boolean;
  children: React.ReactNode;
  /** When true the scroll region is a flex column with no padding (chat views). */
  fill?: boolean;
  /** When set, a read-only banner is shown above the content (impersonation). */
  readOnlyLabel?: string;
}) {
  return (
    <div className="app">
      <Sidebar portalLabel={portalLabel} nav={nav} footer={footer} />
      <main className="main">
        <TopBar eyebrow={eyebrow} title={title} side={side} dateText={dateText} hasUnread={hasUnread} />
        {readOnlyLabel && (
          <div
            style={{
              flex: 'none',
              padding: '8px 34px',
              background: 'rgba(176,122,30,.1)',
              color: 'var(--warn-ink)',
              fontSize: '.76rem',
              fontWeight: 600,
              borderBottom: '1px solid rgba(176,122,30,.18)',
            }}
          >
            {readOnlyLabel}
          </div>
        )}
        <div
          className="acg-scroll scrollRegion"
          style={fill ? { display: 'flex', flexDirection: 'column' } : undefined}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
