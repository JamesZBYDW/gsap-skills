import 'server-only';
import type { InvestorState } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatUSD, formatCompactUSD, formatRate } from '@/lib/money';
import { formatDate, daysBetween } from '@/lib/dates';
import { investorStateLabel, requestStatusLabel } from '@/lib/labels';
import { investorStateTone, requestStatusTone, type Tone } from '@/lib/tone';
import { initials } from '@/lib/display';
import { mapRequest, type RequestVM } from './portal';

// ─── G. Team overview ───────────────────────────────────────────────────────

export interface MaturityRowVM {
  investorId: string;
  investor: string;
  principal: string;
  rate: string;
  matures: string;
  days: string;
  urgent: boolean;
}

export interface TeamOverviewVM {
  totalCapital: string;
  activeNotes: number;
  distributed: string;
  maturingCount: number;
  maturingPrincipal: string;
  maturities: MaturityRowVM[];
  regCount: number;
  openReqCount: number;
  msgUnread: number;
}

export async function getTeamOverview(now = new Date()): Promise<TeamOverviewVM> {
  const activeNotes = await prisma.note.findMany({
    where: { status: 'ACTIVE' },
    include: { investor: { select: { id: true, legalName: true } }, distributions: { where: { paidDate: { not: null } } } },
  });

  const totalCapital = activeNotes.reduce((a, n) => a + n.principalCents, 0);
  const distributed = activeNotes.reduce(
    (a, n) => a + n.distributions.reduce((s, d) => s + d.amountCents, 0),
    0,
  );

  const in90 = new Date(now.getTime() + 90 * 86_400_000);
  const maturingNotes = activeNotes
    .filter((n) => n.maturityDate && n.maturityDate >= now && n.maturityDate <= in90)
    .sort((a, b) => a.maturityDate!.getTime() - b.maturityDate!.getTime());

  const maturities: MaturityRowVM[] = maturingNotes.map((n) => {
    const d = daysBetween(now, n.maturityDate!);
    return {
      investorId: n.investor.id,
      investor: n.investor.legalName,
      principal: formatUSD(n.principalCents),
      rate: formatRate(n.rateBps),
      matures: formatDate(n.maturityDate!),
      days: d === 0 ? 'today' : d === 1 ? 'in 1 day' : `in ${d} days`,
      urgent: d <= 30,
    };
  });

  const [regCount, openReqs, msgUnread] = await Promise.all([
    prisma.registration.count({ where: { status: 'PENDING' } }),
    prisma.request.count({ where: { status: { in: ['PENDING_REVIEW', 'IN_REVIEW', 'NEEDS_INFO'] } } }),
    prisma.message.count({ where: { author: 'INVESTOR', readByTeam: false } }),
  ]);

  return {
    totalCapital: formatCompactUSD(totalCapital),
    activeNotes: activeNotes.length,
    distributed: formatCompactUSD(distributed),
    maturingCount: maturingNotes.length,
    maturingPrincipal: formatCompactUSD(maturingNotes.reduce((a, n) => a + n.principalCents, 0)),
    maturities,
    regCount,
    openReqCount: openReqs,
    msgUnread,
  };
}

// ─── H. Investors roster + detail ─────────────────────────────────────────

export interface InvestorRowVM {
  id: string;
  name: string;
  type: string;
  state: InvestorState;
  stateLabel: string;
  tone: Tone;
  principal: string;
  rate: string;
  term: string;
  email: string;
  wire: string;
  maturity: string;
}

export async function getInvestorsRoster(): Promise<InvestorRowVM[]> {
  const investors = await prisma.investor.findMany({
    orderBy: { createdAt: 'asc' },
    include: { note: true },
  });
  return investors.map((i) => ({
    id: i.id,
    name: i.legalName,
    type: i.type === 'ENTITY' ? 'Entity' : 'Individual',
    state: i.state,
    stateLabel: investorStateLabel[i.state],
    tone: investorStateTone(i.state),
    principal: i.note ? formatUSD(i.note.principalCents) : '—',
    rate: i.note ? formatRate(i.note.rateBps) : '—',
    term: i.note ? `${i.note.termMonths} mo` : '—',
    email: i.email,
    wire: i.note?.wireDate ? formatDate(i.note.wireDate) : '—',
    maturity: i.note?.maturityDate ? formatDate(i.note.maturityDate) : '—',
  }));
}

// ─── I. Registrations queue ─────────────────────────────────────────────────

export interface RegistrationVM {
  id: string;
  name: string;
  type: string;
  email: string;
  principal: string;
  term: string;
  rate: string;
  date: string;
  infoRequested: boolean;
}

export async function getRegistrations(): Promise<RegistrationVM[]> {
  const regs = await prisma.registration.findMany({
    where: { status: 'PENDING' },
    orderBy: { submittedAt: 'desc' },
  });
  return regs.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type === 'ENTITY' ? 'Entity' : 'Individual',
    email: r.email,
    principal: r.intendedPrincipalCents != null ? formatUSD(r.intendedPrincipalCents) : '—',
    term: `${r.termMonths} months`,
    rate: formatRate(r.derivedRateBps),
    date: formatDate(r.submittedAt),
    infoRequested: r.infoRequested,
  }));
}

// ─── J. Requests queue ──────────────────────────────────────────────────────

export interface TeamRequestVM extends RequestVM {
  investorName: string;
}

export async function getTeamRequests(): Promise<TeamRequestVM[]> {
  const reqs = await prisma.request.findMany({
    orderBy: { createdAt: 'desc' },
    include: { history: { orderBy: { order: 'asc' } }, investor: { select: { legalName: true } } },
  });
  return reqs.map((r) => ({ ...mapRequest(r), investorName: r.investor.legalName }));
}

// ─── K. Messages (threads) ──────────────────────────────────────────────────

export interface ThreadMessageVM {
  id: string;
  author: 'INVESTOR' | 'TEAM';
  authorName: string;
  text: string;
  time: string;
}

export interface ThreadVM {
  investorId: string;
  investorName: string;
  initials: string;
  type: string;
  stateLabel: string;
  principal: string;
  last: string;
  time: string;
  unread: number;
  messages: ThreadMessageVM[];
}

export async function getThreads(): Promise<ThreadVM[]> {
  const investors = await prisma.investor.findMany({
    include: {
      note: { select: { principalCents: true } },
      messages: { orderBy: { sentAt: 'asc' } },
    },
  });

  const threads: ThreadVM[] = investors
    .filter((i) => i.messages.length > 0)
    .map((i) => {
      const last = i.messages[i.messages.length - 1]!;
      const unread = i.messages.filter((m) => m.author === 'INVESTOR' && !m.readByTeam).length;
      return {
        investorId: i.id,
        investorName: i.legalName,
        initials: initials(i.legalName),
        type: i.type === 'ENTITY' ? 'Entity' : 'Individual',
        stateLabel: investorStateLabel[i.state],
        principal: i.note ? formatUSD(i.note.principalCents) : '—',
        last: last.text,
        time: formatDate(last.sentAt),
        unread,
        messages: i.messages.map((m) => ({
          id: m.id,
          author: m.author,
          authorName: m.authorName,
          text: m.text,
          time: formatDate(m.sentAt),
        })),
      };
    })
    .sort((a, b) => {
      // Newest activity first; unread threads bubble up.
      if (b.unread !== a.unread) return b.unread - a.unread;
      return 0;
    });

  return threads;
}

export { requestStatusLabel, requestStatusTone };
