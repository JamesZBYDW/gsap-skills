'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon, type IconName } from '../Icon';
import { api } from '@/lib/api-client';
import logoCream from '../../../public/acg-logo-cream.png';

export interface NavItemData {
  href: string;
  label: string;
  icon: IconName;
  badge?: { count: number; tone: 'gold' | 'acc' };
}

export interface SidebarFooter {
  variant: 'investor' | 'team' | 'impersonating';
  name: string;
  sub: string;
  avatarText: string;
}

export function Sidebar({
  portalLabel,
  nav,
  footer,
}: {
  portalLabel: string;
  nav: NavItemData[];
  footer: SidebarFooter;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function exitImpersonation() {
    try {
      await api.post('/api/team/impersonate/stop');
    } finally {
      router.push('/console/overview');
      router.refresh();
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <Image src={logoCream} alt="ACG" height={26} style={{ width: 'auto', display: 'block' }} priority />
        <div className="sidebar__brandLabel">{portalLabel}</div>
      </div>

      <nav className="nav">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link key={item.href} href={item.href} className={`navItem${active ? ' active' : ''}`}>
              <Icon name={item.icon} size={18} />
              {item.label}
              {item.badge && item.badge.count > 0 && (
                <span className={`navBadge navBadge--${item.badge.tone}`}>{item.badge.count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="spacer" />

      <div>
        <div className="userChip">
          <div className={`userAvatar userAvatar--${footer.variant === 'team' ? 'team' : 'investor'}`}>
            {footer.avatarText}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="userChip__name">{footer.name}</div>
            <div className="userChip__role">{footer.sub}</div>
          </div>
        </div>

        {footer.variant === 'impersonating' && (
          <button className="switchBtn" onClick={exitImpersonation}>
            <Icon name="arrow-left" size={14} strokeWidth={2} />
            Exit investor view
          </button>
        )}
      </div>
    </aside>
  );
}
