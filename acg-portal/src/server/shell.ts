import 'server-only';
import { prisma } from '@/lib/db';
import { initials } from '@/lib/display';
import { requireInvestorView, requireTeamView } from '@/lib/auth';
import type { NavItemData, SidebarFooter } from '@/components/shell/Sidebar';

export interface InvestorShell {
  portalLabel: string;
  nav: NavItemData[];
  footer: SidebarFooter;
  hasUnread: boolean;
}

export async function getInvestorShell(
  investorId: string,
  opts: { impersonating: boolean; viewerName: string },
): Promise<InvestorShell> {
  const investor = await prisma.investor.findUniqueOrThrow({
    where: { id: investorId },
    select: { legalName: true },
  });

  const unread = await prisma.message.count({
    where: { investorId, author: 'TEAM', readByInvestor: false },
  });

  const nav: NavItemData[] = [
    { href: '/portal/overview', label: 'Overview', icon: 'grid' },
    { href: '/portal/schedule', label: 'Schedule', icon: 'calendar' },
    { href: '/portal/messages', label: 'Messages', icon: 'message', badge: { count: unread, tone: 'gold' } },
    { href: '/portal/documents', label: 'Documents', icon: 'file' },
    { href: '/portal/profile', label: 'Profile', icon: 'user' },
  ];

  const footer: SidebarFooter = opts.impersonating
    ? {
        variant: 'impersonating',
        name: investor.legalName,
        sub: 'Viewing as IR · read-only',
        avatarText: initials(investor.legalName),
      }
    : {
        variant: 'investor',
        name: investor.legalName,
        sub: 'Accredited investor',
        avatarText: initials(investor.legalName),
      };

  return { portalLabel: 'INVESTOR PORTAL', nav, footer, hasUnread: unread > 0 };
}

export interface TeamShell {
  portalLabel: string;
  nav: NavItemData[];
  footer: SidebarFooter;
  hasUnread: boolean;
}

export async function getTeamShell(viewerName: string): Promise<TeamShell> {
  const [pendingRegs, unreadByTeam] = await Promise.all([
    prisma.registration.count({ where: { status: 'PENDING' } }),
    prisma.message.count({ where: { author: 'INVESTOR', readByTeam: false } }),
  ]);

  const nav: NavItemData[] = [
    { href: '/console/overview', label: 'Overview', icon: 'grid' },
    { href: '/console/investors', label: 'Investors', icon: 'users' },
    { href: '/console/registrations', label: 'Registrations', icon: 'user-plus', badge: { count: pendingRegs, tone: 'gold' } },
    { href: '/console/messages', label: 'Messages', icon: 'message', badge: { count: unreadByTeam, tone: 'acc' } },
  ];

  const footer: SidebarFooter = {
    variant: 'team',
    name: 'Investor Relations',
    sub: `${viewerName} · Admin`,
    avatarText: 'IR',
  };

  return { portalLabel: 'TEAM CONSOLE', nav, footer, hasUnread: unreadByTeam > 0 };
}

// ─── Page frame helpers (guard + shell in one call) ─────────────────────────

export async function getPortalFrame() {
  const { investorId, readOnly, actor } = await requireInvestorView();
  const shell = await getInvestorShell(investorId, { impersonating: readOnly, viewerName: actor.user.name });
  return {
    investorId,
    readOnly,
    shell,
    readOnlyLabel: readOnly
      ? `Read-only — viewing ${shell.footer.name}'s portal as Investor Relations`
      : undefined,
  };
}

export async function getTeamFrame() {
  const actor = await requireTeamView();
  const shell = await getTeamShell(actor.user.name);
  return { actor, shell };
}
