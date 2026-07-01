import 'server-only';
import type { InvestorState } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatUSD, formatCompactUSD, formatRate } from '@/lib/money';
import { formatDate, daysBetween, startOfUTCDay, toISODate } from '@/lib/dates';
import { investorStateLabel } from '@/lib/labels';
import { investorStateTone, type Tone } from '@/lib/tone';

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

  // Maturity dates are calendar dates (UTC midnight); compare against the start
  // of today so a note maturing today is still counted (not dropped by time-of-day).
  const today = startOfUTCDay(now);
  const in90 = new Date(today.getTime() + 90 * 86_400_000);
  const maturingNotes = activeNotes
    .filter((n) => n.maturityDate && n.maturityDate >= today && n.maturityDate <= in90)
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

  return {
    totalCapital: formatCompactUSD(totalCapital),
    activeNotes: activeNotes.length,
    distributed: formatCompactUSD(distributed),
    maturingCount: maturingNotes.length,
    maturingPrincipal: formatCompactUSD(maturingNotes.reduce((a, n) => a + n.principalCents, 0)),
    maturities,
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
  hasLogin: boolean;
  // Raw values for the management "Manage note" form (prefill).
  edit: {
    principalDollars: string;
    ratePercent: string;
    termMonths: number;
    wireReceivedISO: string;
  };
}

const dollars = (cents: number) => String(Math.round(cents) / 100);

export async function getInvestorsRoster(now = new Date()): Promise<InvestorRowVM[]> {
  const investors = await prisma.investor.findMany({
    orderBy: { createdAt: 'asc' },
    include: { note: true, user: { select: { id: true } } },
  });
  const today = startOfUTCDay(now);
  return investors.map((i) => {
    // Expired is derived, not stored: an active note past its maturity has made
    // its final (principal-bearing) distribution.
    const expired = i.state === 'ACTIVE' && !!i.note?.maturityDate && i.note.maturityDate < today;
    return {
      id: i.id,
      name: i.legalName,
      type: i.type === 'ENTITY' ? 'Entity' : 'Individual',
      state: i.state,
      stateLabel: expired ? 'Expired' : investorStateLabel[i.state],
      tone: expired ? 'mute' : investorStateTone(i.state),
      principal: i.note && i.note.principalCents ? formatUSD(i.note.principalCents) : '—',
      rate: i.note && i.note.rateBps ? formatRate(i.note.rateBps) : '—',
      term: i.note && i.note.termMonths ? `${i.note.termMonths} mo` : '—',
      email: i.email,
      wire: i.note?.wireDate ? formatDate(i.note.wireDate) : '—',
      maturity: i.note?.maturityDate ? formatDate(i.note.maturityDate) : '—',
      hasLogin: !!i.user,
      edit: {
        principalDollars: i.note && i.note.principalCents ? dollars(i.note.principalCents) : '',
        ratePercent: i.note && i.note.rateBps ? String(i.note.rateBps / 100) : '',
        termMonths: i.note && i.note.termMonths ? i.note.termMonths : 24,
        wireReceivedISO: i.note?.wireDate ? toISODate(i.note.wireDate) : '',
      },
    };
  });
}

