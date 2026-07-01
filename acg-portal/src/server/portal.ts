import 'server-only';
import type { InvestorState } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatUSD, formatRate, formatRatePrecise } from '@/lib/money';
import { formatDate, formatDateLong, formatMonthYear, arrivalLabel, daysBetween } from '@/lib/dates';
import { deriveStatuses, MATURITY_NOTICE_DAYS, type DistributionDisplayStatus } from '@/lib/schedule';
import { investorStateTone, distributionTone, distributionStatusLabel, type Tone } from '@/lib/tone';
import { documentKindLabel } from '@/lib/labels';
import { firstName, maskedAccount } from '@/lib/display';

const CIRC = 2 * Math.PI * 50; // maturity-ring circumference (r=50)

async function loadNote(investorId: string) {
  return prisma.note.findUnique({
    where: { investorId },
    include: { distributions: { orderBy: { index: 'asc' } } },
  });
}

// ─── A. Overview (note dashboard + full distribution ledger, one page) ──────

export interface BarVM {
  status: DistributionDisplayStatus;
}

export interface LedgerRowVM {
  n: number;
  date: string;
  amount: string;
  statusLabel: string;
  tone: Tone;
  status: DistributionDisplayStatus;
  ref: string;
}

export interface OverviewVM {
  investorName: string;
  greetingName: string;
  state: InvestorState;
  active: boolean;
  principal: string;
  rate: string;
  rateSub: string;
  statusLabel: string;
  statusTone: Tone;
  statusSub: string;
  /**
   * Maturity notice, replacing the monthly-income tile: 'window' inside the
   * 90-day pre-expiry window, 'expired' after the final (principal-bearing)
   * distribution, 'none' otherwise.
   */
  notice: { level: 'none' | 'window' | 'expired'; value: string; sub: string };
  next: { amount: string; arrival: string; date: string } | null;
  maturity: {
    percent: number;
    circumference: number;
    dash: number;
    dateLabel: string;
    remaining: string;
    paidLabel: string;
  } | null;
  distributed: { amount: string; count: string };
  bars: BarVM[];
  termRangeStart: string;
  termRangeEnd: string;
  ledger: LedgerRowVM[];
}

export async function getOverview(investorId: string, now = new Date()): Promise<OverviewVM> {
  const investor = await prisma.investor.findUniqueOrThrow({ where: { id: investorId } });
  const note = await loadNote(investorId);

  const base = {
    investorName: investor.legalName,
    greetingName: firstName(investor.legalName),
    state: investor.state,
    statusLabel: investor.state.charAt(0) + investor.state.slice(1).toLowerCase(),
    statusTone: investorStateTone(investor.state),
  };

  if (!note || note.status !== 'ACTIVE' || note.distributions.length === 0) {
    return {
      ...base,
      active: false,
      principal: note ? formatUSD(note.principalCents) : '—',
      rate: note ? formatRatePrecise(note.rateBps) : '—',
      rateSub: note ? `over ${note.termMonths} months` : '',
      statusSub: investor.state === 'AWAITING' ? 'awaiting your wire' : investor.state === 'PENDING' ? 'under review' : '',
      notice: { level: 'none', value: 'None', sub: 'we notify you 90 days before your note expires' },
      next: null,
      maturity: null,
      distributed: { amount: '$0', count: note ? `0 of ${note.termMonths}` : '' },
      bars: [],
      termRangeStart: '',
      termRangeEnd: '',
      ledger: [],
    };
  }

  const statuses = deriveStatuses(note.distributions);
  const paidCount = note.distributions.filter((d) => d.paidDate).length;
  const next = note.distributions.find((d) => statuses.get(d.index) === 'NEXT') ?? null;
  const term = note.termMonths;
  // Progress and counts are over the actual generated schedule length, which may
  // differ from termMonths (distributions recur every 30 days, not monthly).
  const total = note.distributions.length;
  const remaining = Math.max(0, total - paidCount);
  const fraction = total > 0 ? paidCount / total : 0;

  // Expiry is derived at read time: the note is Expired after its final
  // (principal-bearing) distribution; inside the 90-day pre-expiry window the
  // investor sees a maturity notice (management sees it on the team overview).
  const lastDue = note.distributions[note.distributions.length - 1]!.dueDate;
  const daysToExpiry = daysBetween(now, lastDue);
  const expired = daysToExpiry < 0;
  const notice: OverviewVM['notice'] = expired
    ? { level: 'expired', value: 'Note expired', sub: `final distribution ${formatDate(lastDue)}` }
    : daysToExpiry <= MATURITY_NOTICE_DAYS
      ? {
          level: 'window',
          value: daysToExpiry === 0 ? 'Expires today' : `Expires in ${daysToExpiry} day${daysToExpiry === 1 ? '' : 's'}`,
          sub: `final distribution ${formatDate(lastDue)} — Investor Relations will contact you`,
        }
      : { level: 'none', value: 'None', sub: 'we notify you 90 days before your note expires' };

  return {
    ...base,
    ...(expired ? { statusLabel: 'Expired', statusTone: 'mute' as Tone } : null),
    active: true,
    principal: formatUSD(note.principalCents),
    rate: formatRatePrecise(note.rateBps),
    rateSub: `over ${term} months`,
    statusSub: expired
      ? `matured ${formatDate(lastDue)}`
      : note.wireDate
        ? `funded ${formatMonthYear(note.wireDate)}`
        : '',
    notice,
    next: next
      ? { amount: formatUSD(next.amountCents), arrival: arrivalLabel(next.dueDate, now), date: formatDate(next.dueDate) }
      : null,
    maturity: note.maturityDate
      ? {
          percent: Math.round(fraction * 100),
          circumference: CIRC,
          dash: fraction * CIRC,
          dateLabel: formatDateLong(note.maturityDate),
          remaining: `${remaining} distribution${remaining === 1 ? '' : 's'} remaining`,
          paidLabel: `${paidCount} of ${total} distributions paid`,
        }
      : null,
    distributed: { amount: formatUSD(paidCount * note.monthlyAmountCents), count: `${paidCount} of ${total}` },
    bars: note.distributions.map((d) => ({ status: statuses.get(d.index)! })),
    termRangeStart: formatMonthYear(note.distributions[0]!.dueDate),
    termRangeEnd: formatMonthYear(note.distributions[note.distributions.length - 1]!.dueDate),
    ledger: note.distributions.map((d) => {
      const status = statuses.get(d.index)!;
      return {
        n: d.index,
        date: formatDate(d.dueDate),
        amount: formatUSD(d.amountCents),
        statusLabel: distributionStatusLabel[status],
        tone: distributionTone(status),
        status,
        ref: d.reference ?? '—',
      };
    }),
  };
}

// ─── E. Documents ───────────────────────────────────────────────────────────

export interface DocumentVM {
  id: string;
  name: string;
  kindLabel: string;
  date: string;
}

export async function getDocuments(investorId: string): Promise<DocumentVM[]> {
  const docs = await prisma.document.findMany({ where: { investorId }, orderBy: { issuedDate: 'desc' } });
  return docs.map((d) => ({
    id: d.id,
    name: d.name,
    kindLabel: documentKindLabel[d.kind],
    date: formatDate(d.issuedDate),
  }));
}

// ─── F. Profile ─────────────────────────────────────────────────────────────

export interface ProfileVM {
  legalName: string;
  type: string;
  email: string;
  phone: string;
  banking: { display: string; method: string } | null;
  notif: { distributionPosted: boolean; maturityReminder: boolean };
}

export async function getProfile(investorId: string): Promise<ProfileVM> {
  const investor = await prisma.investor.findUniqueOrThrow({
    where: { id: investorId },
    include: { banking: true, notifPref: true },
  });
  return {
    legalName: investor.legalName,
    type: investor.type === 'ENTITY' ? 'Entity' : 'Individual',
    email: investor.email,
    phone: investor.phone ?? '—',
    banking: investor.banking
      ? { display: maskedAccount(investor.banking.bankName, investor.banking.last4), method: investor.banking.method }
      : null,
    notif: {
      distributionPosted: investor.notifPref?.distributionPosted ?? true,
      maturityReminder: investor.notifPref?.maturityReminder ?? true,
    },
  };
}

// Re-export for views.
export { formatRate };
