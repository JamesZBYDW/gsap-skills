/* eslint-disable no-console */
import { PrismaClient, type InvestorType, type InvestorState } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { deriveRateBps } from '../src/lib/rates';
import { monthlyDistributionCents } from '../src/lib/money';
import { generateSchedule, computeMaturity, distributionReference } from '../src/lib/schedule';
import { utcDate } from '../src/lib/dates';

const prisma = new PrismaClient();

const ARGON2_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const NOW = new Date();

function hashPw(pw: string) {
  return hash(pw, ARGON2_OPTS);
}

interface SeedInvestor {
  key: string;
  legalName: string;
  type: InvestorType;
  email: string;
  phone?: string;
  state: InvestorState;
  principalCents?: number;
  termMonths?: number;
  wireDate?: Date | null;
  distributionDay?: number;
  accreditedAt?: Date | null;
  login?: { password: string }; // create an investor User login
  banking?: { bankName: string; last4: string; method: string };
  notif?: { distributionPosted: boolean; maturityReminder: boolean; newMessage: boolean };
  w9OnFile?: boolean;
}

const $ = (dollars: number) => Math.round(dollars * 100);

const investorsSeed: SeedInvestor[] = [
  {
    key: 'vance',
    legalName: 'Margaret Vance',
    type: 'INDIVIDUAL',
    email: process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com',
    phone: '(212) 555·0148',
    state: 'ACTIVE',
    principalCents: $(250_000),
    termMonths: 24,
    wireDate: utcDate(2025, 3, 14), // Apr 14, 2025
    accreditedAt: utcDate(2025, 3, 10), // Apr 10, 2025
    login: { password: process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234' },
    banking: { bankName: 'Chase', last4: '6042', method: 'ACH · monthly' },
    notif: { distributionPosted: true, maturityReminder: true, newMessage: false },
    w9OnFile: true,
  },
  {
    key: 'vancefo',
    legalName: 'Vance Family Office',
    type: 'ENTITY',
    email: 'ops@vancefo.com',
    state: 'ACTIVE',
    principalCents: $(1_200_000),
    termMonths: 24,
    wireDate: utcDate(2025, 4, 2), // May 2, 2025
    accreditedAt: utcDate(2025, 4, 1),
  },
  {
    key: 'beckett',
    legalName: 'Harold & Anne Beckett',
    type: 'INDIVIDUAL',
    email: 'beckett@me.com',
    state: 'ACTIVE',
    principalCents: $(500_000),
    termMonths: 36,
    wireDate: utcDate(2023, 6, 21), // Jul 21, 2023
    accreditedAt: utcDate(2023, 6, 18),
  },
  {
    key: 'crest',
    legalName: 'Crest Harbor Holdings',
    type: 'ENTITY',
    email: 'admin@crestharbor.com',
    state: 'AWAITING',
    principalCents: $(750_000),
    termMonths: 18,
    wireDate: null,
    accreditedAt: utcDate(2026, 5, 20),
  },
  {
    key: 'okafor',
    legalName: 'Dr. Lena Okafor',
    type: 'INDIVIDUAL',
    email: 'l.okafor@clinic.org',
    state: 'ACTIVE',
    principalCents: $(300_000),
    termMonths: 24,
    wireDate: utcDate(2024, 8, 12), // Sep 12, 2024
    accreditedAt: utcDate(2024, 8, 10),
  },
  {
    key: 'ramsey',
    legalName: 'Theodore Ramsey',
    type: 'INDIVIDUAL',
    email: 't.ramsey@outlook.com',
    state: 'PENDING',
    principalCents: $(150_000),
    termMonths: 12,
    wireDate: null,
  },
  {
    key: 'juniper',
    legalName: 'Juniper Trust',
    type: 'ENTITY',
    email: 'trustee@junipertrust.org',
    state: 'ACTIVE',
    principalCents: $(2_000_000),
    termMonths: 36,
    wireDate: utcDate(2023, 8, 28), // Sep 28, 2023
    accreditedAt: utcDate(2023, 8, 25),
  },
  {
    key: 'bell',
    legalName: 'Marcus Bell',
    type: 'INDIVIDUAL',
    email: 'mbell@gmail.com',
    state: 'DECLINED',
  },
];

async function reset() {
  // Delete in FK-safe order.
  await prisma.auditLog.deleteMany();
  await prisma.requestHistory.deleteMany();
  await prisma.request.deleteMany();
  await prisma.message.deleteMany();
  await prisma.document.deleteMany();
  await prisma.distribution.deleteMany();
  await prisma.note.deleteMany();
  await prisma.bankingDetail.deleteMany();
  await prisma.notifPref.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.session.deleteMany();
  await prisma.investor.deleteMany();
  await prisma.user.deleteMany();
}

async function seedInvestors() {
  const ids: Record<string, string> = {};

  for (const s of investorsSeed) {
    const hasTerms = s.principalCents != null && s.termMonths != null;
    const rateBps = hasTerms ? deriveRateBps(s.termMonths!) : 0;
    const monthly = hasTerms ? monthlyDistributionCents(s.principalCents!, rateBps) : 0;

    const investor = await prisma.investor.create({
      data: {
        legalName: s.legalName,
        type: s.type,
        email: s.email,
        phone: s.phone ?? null,
        state: s.state,
        accreditationAcknowledged: !!s.accreditedAt,
        accreditationConfirmedAt: s.accreditedAt ?? null,
        w9OnFile: !!s.w9OnFile,
      },
    });
    ids[s.key] = investor.id;

    // Investor login user (only where a password was provided).
    if (s.login) {
      const user = await prisma.user.create({
        data: {
          role: 'INVESTOR',
          name: s.legalName,
          email: s.email.toLowerCase(),
          passwordHash: await hashPw(s.login.password),
          phone: s.phone ?? null,
        },
      });
      await prisma.investor.update({ where: { id: investor.id }, data: { userId: user.id } });
    }

    // Banking + notification prefs (investor-facing profile data).
    if (s.banking) {
      await prisma.bankingDetail.create({
        data: { investorId: investor.id, ...s.banking },
      });
    }
    if (s.notif) {
      await prisma.notifPref.create({ data: { investorId: investor.id, ...s.notif } });
    }

    // Note + schedule.
    if (hasTerms) {
      const isActive = s.state === 'ACTIVE' && s.wireDate;
      const wireDate = s.wireDate ?? null;
      const distributionDay = s.distributionDay ?? 1;
      const maturityDate = wireDate ? computeMaturity(wireDate, s.termMonths!) : null;
      const firstDist = wireDate
        ? generateSchedule(wireDate, s.termMonths!, distributionDay, monthly)[0]?.dueDate ?? null
        : null;

      const note = await prisma.note.create({
        data: {
          investorId: investor.id,
          principalCents: s.principalCents!,
          rateBps,
          termMonths: s.termMonths!,
          monthlyAmountCents: monthly,
          wireDate,
          firstDistributionDate: firstDist,
          maturityDate,
          distributionDay,
          status: isActive ? 'ACTIVE' : 'AWAITING',
        },
      });

      if (isActive && wireDate) {
        const schedule = generateSchedule(wireDate, s.termMonths!, distributionDay, monthly);
        for (const d of schedule) {
          const paid = d.dueDate <= NOW;
          await prisma.distribution.create({
            data: {
              noteId: note.id,
              index: d.index,
              dueDate: d.dueDate,
              amountCents: d.amountCents,
              paidDate: paid ? d.dueDate : null,
              reference: paid ? distributionReference(d.index) : null,
            },
          });
        }
      }
    }
  }

  return ids;
}

async function seedTeamUser() {
  await prisma.user.create({
    data: {
      role: 'TEAM',
      name: 'James',
      email: (process.env.SEED_TEAM_EMAIL ?? 'james@acg.example').toLowerCase(),
      passwordHash: await hashPw(process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123'),
    },
  });
}

async function seedDocuments(vanceId: string) {
  const docs = [
    { name: 'Distribution statement — June 2026', kind: 'STATEMENT' as const, issuedDate: utcDate(2026, 6, 1) },
    { name: 'Distribution statement — May 2026', kind: 'STATEMENT' as const, issuedDate: utcDate(2026, 5, 1) },
    { name: 'Mid-year summary — 2026', kind: 'SUMMARY' as const, issuedDate: utcDate(2026, 5, 2) },
    { name: 'Form 1099-INT — 2025', kind: 'TAX' as const, issuedDate: utcDate(2026, 0, 31) },
    { name: 'ACG Promissory Note — executed', kind: 'AGREEMENT' as const, issuedDate: utcDate(2025, 3, 14) },
    { name: 'Subscription agreement', kind: 'AGREEMENT' as const, issuedDate: utcDate(2025, 3, 10) },
  ];
  for (const d of docs) {
    await prisma.document.create({ data: { investorId: vanceId, storageKey: '', ...d } });
  }
}

async function seedRegistrations() {
  const regs = [
    { name: 'Theodore Ramsey', type: 'INDIVIDUAL' as const, email: 't.ramsey@outlook.com', principal: $(150_000), termMonths: 12, submittedAt: utcDate(2026, 5, 27) },
    { name: 'Pellas Capital LLC', type: 'ENTITY' as const, email: 'ops@pellascap.com', principal: $(1_000_000), termMonths: 24, submittedAt: utcDate(2026, 5, 26) },
    { name: 'Sofia Marenco', type: 'INDIVIDUAL' as const, email: 'sofia.m@proton.me', principal: $(200_000), termMonths: 18, submittedAt: utcDate(2026, 5, 23) },
  ];
  for (const r of regs) {
    await prisma.registration.create({
      data: {
        name: r.name,
        type: r.type,
        email: r.email,
        intendedPrincipalCents: r.principal,
        termMonths: r.termMonths,
        derivedRateBps: deriveRateBps(r.termMonths),
        status: 'PENDING',
        acknowledgedAccredited: true,
        submittedAt: r.submittedAt,
      },
    });
  }
}

async function seedRequests(ids: Record<string, string>) {
  const requests = [
    {
      investorId: ids.vance!, type: 'UPDATE_BANKING' as const, title: 'Update ACH details',
      detail: 'Move distributions to Chase account ending 7781.', status: 'NEEDS_INFO' as const,
      note: 'For your security, banking changes are confirmed by phone before they take effect.',
      createdAt: utcDate(2026, 5, 24),
      history: [
        { label: 'Submitted', dateText: 'Jun 24, 2026', done: true },
        { label: 'Reviewed by Investor Relations', dateText: 'Jun 24, 2026', done: true },
        { label: 'Phone confirmation', dateText: 'Scheduled Jun 25, 2:30pm ET', done: false },
      ],
    },
    {
      investorId: ids.vance!, type: 'MATURITY_ELECTION' as const, title: 'Maturity election — renew for 24 months',
      detail: 'Renew the note for another 24-month term at maturity.', status: 'PENDING_REVIEW' as const, note: '',
      createdAt: utcDate(2026, 5, 28),
      history: [{ label: 'Submitted', dateText: 'Jun 28, 2026', done: true }],
    },
    {
      investorId: ids.vance!, type: 'DOCUMENT' as const, title: 'Request mid-year statement',
      detail: 'Mid-year 2026 summary for my records.', status: 'COMPLETED' as const, note: '',
      createdAt: utcDate(2026, 5, 2),
      history: [
        { label: 'Submitted', dateText: 'Jun 2, 2026', done: true },
        { label: 'Document delivered', dateText: 'Jun 2, 2026', done: true },
      ],
    },
    {
      investorId: ids.beckett!, type: 'MATURITY_ELECTION' as const, title: 'Redeem at maturity',
      detail: 'Please redeem in full at maturity on Jul 21.', status: 'PENDING_REVIEW' as const, note: '',
      createdAt: utcDate(2026, 5, 27),
      history: [{ label: 'Submitted', dateText: 'Jun 27, 2026', done: true }],
    },
    {
      investorId: ids.okafor!, type: 'ADD_CAPITAL' as const, title: 'Add $100,000 to note',
      detail: 'Increase principal by $100,000 at the current rate.', status: 'PENDING_REVIEW' as const, note: '',
      createdAt: utcDate(2026, 5, 28),
      history: [{ label: 'Submitted', dateText: 'Jun 28, 2026', done: true }],
    },
    {
      investorId: ids.juniper!, type: 'DOCUMENT' as const, title: 'Request K-1 statement',
      detail: '', status: 'APPROVED' as const, note: '',
      createdAt: utcDate(2026, 5, 20),
      history: [
        { label: 'Submitted', dateText: 'Jun 20, 2026', done: true },
        { label: 'Approved', dateText: 'Jun 20, 2026', done: true },
      ],
    },
    {
      investorId: ids.vancefo!, type: 'UPDATE_PROFILE' as const, title: 'Update primary contact',
      detail: '', status: 'COMPLETED' as const, note: '',
      createdAt: utcDate(2026, 5, 18),
      history: [
        { label: 'Submitted', dateText: 'Jun 18, 2026', done: true },
        { label: 'Completed', dateText: 'Jun 18, 2026', done: true },
      ],
    },
  ];

  for (const r of requests) {
    const { history, ...rest } = r;
    await prisma.request.create({
      data: {
        ...rest,
        history: {
          create: history.map((h, i) => ({ ...h, order: i })),
        },
      },
    });
  }
}

async function seedMessages(ids: Record<string, string>) {
  const team = 'James · Investor Relations';
  const threads: Array<{ investorId: string; investorName: string; msgs: Array<{ author: 'INVESTOR' | 'TEAM'; text: string; sentAt: Date; readByTeam?: boolean; readByInvestor?: boolean }> }> = [
    {
      investorId: ids.vance!, investorName: 'Margaret Vance',
      msgs: [
        { author: 'TEAM', text: 'Good morning, Margaret. Your June distribution of $3,750 posted on the 1st as scheduled. Anything I can help with?', sentAt: utcDate(2026, 5, 1), readByInvestor: true, readByTeam: true },
        { author: 'INVESTOR', text: "Thank you, James. I'd like to update the bank account my distributions are sent to.", sentAt: utcDate(2026, 5, 24), readByInvestor: true, readByTeam: true },
        { author: 'TEAM', text: "Of course. I've opened a banking-update request for you. For your security we'll confirm the new details with you by phone before they take effect.", sentAt: utcDate(2026, 5, 24), readByInvestor: true, readByTeam: true },
        { author: 'INVESTOR', text: "Perfect — I'm available after 2pm ET tomorrow.", sentAt: utcDate(2026, 5, 24), readByInvestor: true, readByTeam: true },
        { author: 'TEAM', text: "Booked. I'll call at 2:30pm ET. Talk soon.", sentAt: utcDate(2026, 5, 25), readByInvestor: true, readByTeam: true },
      ],
    },
    {
      investorId: ids.beckett!, investorName: 'Harold & Anne Beckett',
      msgs: [
        { author: 'INVESTOR', text: 'We would like to redeem at maturity next month.', sentAt: utcDate(2026, 5, 27), readByTeam: false, readByInvestor: true },
        { author: 'INVESTOR', text: 'Could you send the redemption form?', sentAt: utcDate(2026, 5, 27), readByTeam: false, readByInvestor: true },
      ],
    },
    {
      investorId: ids.okafor!, investorName: 'Dr. Lena Okafor',
      msgs: [
        { author: 'TEAM', text: 'Your add-capital request is in review; we will confirm shortly.', sentAt: utcDate(2026, 5, 24), readByTeam: true, readByInvestor: true },
        { author: 'INVESTOR', text: 'Thank you!', sentAt: utcDate(2026, 5, 24), readByTeam: true, readByInvestor: true },
      ],
    },
    {
      investorId: ids.juniper!, investorName: 'Juniper Trust',
      msgs: [
        { author: 'TEAM', text: 'Your K-1 statement has been approved and will be delivered to the portal.', sentAt: utcDate(2026, 5, 20), readByTeam: true, readByInvestor: true },
        { author: 'INVESTOR', text: 'Received, thanks.', sentAt: utcDate(2026, 5, 20), readByTeam: true, readByInvestor: true },
      ],
    },
  ];

  for (const t of threads) {
    for (const m of t.msgs) {
      await prisma.message.create({
        data: {
          investorId: t.investorId,
          author: m.author,
          authorName: m.author === 'TEAM' ? team : t.investorName,
          text: m.text,
          sentAt: m.sentAt,
          readByTeam: m.readByTeam ?? false,
          readByInvestor: m.readByInvestor ?? false,
        },
      });
    }
  }
}

async function main() {
  console.log('Resetting database…');
  await reset();
  console.log('Seeding team user…');
  await seedTeamUser();
  console.log('Seeding investors + notes + schedules…');
  const ids = await seedInvestors();
  console.log('Seeding documents, registrations, requests, messages…');
  await seedDocuments(ids.vance!);
  await seedRegistrations();
  await seedRequests(ids);
  await seedMessages(ids);
  console.log('Seed complete.');
  console.log(`  Investor login: ${process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com'}`);
  console.log(`  Team login:     ${process.env.SEED_TEAM_EMAIL ?? 'james@acg.example'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
