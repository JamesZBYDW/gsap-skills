import 'server-only';
import type { InvestorState } from '@prisma/client';
import { prisma } from '@/lib/db';
import { formatUSD, formatRate, formatRatePrecise } from '@/lib/money';
import { formatDate, formatDateLong, formatMonthYear, arrivalLabel } from '@/lib/dates';
import { deriveStatuses, type DistributionDisplayStatus } from '@/lib/schedule';
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

// ─── A. Overview ────────────────────────────────────────────────────────────

export interface BarVM {
  status: DistributionDisplayStatus;
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
  monthly: string;
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
      monthly: note ? formatUSD(note.monthlyAmountCents) : '—',
      next: null,
      maturity: null,
      distributed: { amount: '$0', count: note ? `0 of ${note.termMonths}` : '' },
      bars: [],
      termRangeStart: '',
      termRangeEnd: '',
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

  return {
    ...base,
    active: true,
    principal: formatUSD(note.principalCents),
    rate: formatRatePrecise(note.rateBps),
    rateSub: `over ${term} months`,
    statusSub: note.wireDate ? `funded ${formatMonthYear(note.wireDate)}` : '',
    monthly: formatUSD(note.monthlyAmountCents),
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
  };
}

// ─── B. Schedule ──────────────────────────────────────────────────────────

export interface LedgerRowVM {
  n: number;
  date: string;
  amount: string;
  statusLabel: string;
  tone: Tone;
  status: DistributionDisplayStatus;
  ref: string;
}

export interface ScheduleVM {
  active: boolean;
  distributedAmount: string;
  paidCount: number;
  termMonths: number;
  nextDate: string | null;
  nextAmount: string | null;
  nextArrival: string | null;
  remainingAmount: string;
  remainingCount: number;
  rangeStart: string;
  rangeEnd: string;
  bars: BarVM[];
  ledger: LedgerRowVM[];
}

export async function getSchedule(investorId: string, now = new Date()): Promise<ScheduleVM> {
  const note = await loadNote(investorId);
  if (!note || note.status !== 'ACTIVE' || note.distributions.length === 0) {
    return {
      active: false,
      distributedAmount: '$0',
      paidCount: 0,
      termMonths: note?.termMonths ?? 0,
      nextDate: null,
      nextAmount: null,
      nextArrival: null,
      remainingAmount: '$0',
      remainingCount: 0,
      rangeStart: '',
      rangeEnd: '',
      bars: [],
      ledger: [],
    };
  }

  const statuses = deriveStatuses(note.distributions);
  const paidCount = note.distributions.filter((d) => d.paidDate).length;
  const next = note.distributions.find((d) => statuses.get(d.index) === 'NEXT') ?? null;
  // Remaining is over the actual schedule length (30-day cadence), not termMonths.
  const remainingCount = Math.max(0, note.distributions.length - paidCount);

  const ledger: LedgerRowVM[] = note.distributions.map((d) => {
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
  });

  return {
    active: true,
    distributedAmount: formatUSD(paidCount * note.monthlyAmountCents),
    paidCount,
    termMonths: note.termMonths,
    nextDate: next ? formatDate(next.dueDate) : null,
    nextAmount: next ? formatUSD(next.amountCents) : null,
    nextArrival: next ? arrivalLabel(next.dueDate, now) : null,
    remainingAmount: formatUSD(remainingCount * note.monthlyAmountCents),
    remainingCount,
    rangeStart: formatMonthYear(note.distributions[0]!.dueDate),
    rangeEnd: formatMonthYear(note.distributions[note.distributions.length - 1]!.dueDate),
    bars: note.distributions.map((d) => ({ status: statuses.get(d.index)! })),
    ledger,
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
  accreditation: { acknowledged: boolean; confirmedDate: string | null };
  banking: { display: string; method: string } | null;
  w9OnFile: boolean;
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
    accreditation: {
      acknowledged: investor.accreditationAcknowledged,
      confirmedDate: investor.accreditationConfirmedAt ? formatDate(investor.accreditationConfirmedAt) : null,
    },
    banking: investor.banking
      ? { display: maskedAccount(investor.banking.bankName, investor.banking.last4), method: investor.banking.method }
      : null,
    w9OnFile: investor.w9OnFile,
    notif: {
      distributionPosted: investor.notifPref?.distributionPosted ?? true,
      maturityReminder: investor.notifPref?.maturityReminder ?? true,
    },
  };
}

// Re-export for views.
export { formatRate };
