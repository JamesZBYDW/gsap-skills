/* eslint-disable no-console */
import { PrismaClient, type InvestorType, type InvestorState } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { deriveRateBps } from '../src/lib/rates';
import { monthlyDistributionCents } from '../src/lib/money';
import { generateScheduleBetween, computeMaturity, distributionReference } from '../src/lib/schedule';
import { utcDate, addDays } from '../src/lib/dates';

const prisma = new PrismaClient();

const ARGON2_OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
// Fixed "as of" date so the seeded demo is deterministic (Margaret shows a
// stable 14 of 24 paid regardless of the real clock), matching the prototype.
const AS_OF = new Date(Date.UTC(2026, 5, 30)); // Jun 30, 2026

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
  login?: { password: string }; // create an investor User login
  banking?: { bankName: string; last4: string; method: string };
  notif?: { distributionPosted: boolean; maturityReminder: boolean };
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
    login: { password: process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234' },
    banking: { bankName: 'Chase', last4: '6042', method: 'ACH · monthly' },
    notif: { distributionPosted: true, maturityReminder: true },
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
  await prisma.document.deleteMany();
  await prisma.distribution.deleteMany();
  await prisma.note.deleteMany();
  await prisma.bankingDetail.deleteMany();
  await prisma.notifPref.deleteMany();
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

    // Note + schedule — everything derives from the wire-received date: the
    // first distribution 30 days after the wire, then every 30 days through
    // maturity (wire + term); the final distribution also returns the principal.
    if (hasTerms) {
      const isActive = s.state === 'ACTIVE' && s.wireDate;
      const wireDate = s.wireDate ?? null;
      const maturityDate = wireDate ? computeMaturity(wireDate, s.termMonths!) : null;
      const firstDist = wireDate ? addDays(wireDate, 30) : null;

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
          distributionDay: firstDist ? firstDist.getUTCDate() : 1,
          status: isActive ? 'ACTIVE' : 'AWAITING',
        },
      });

      if (isActive && firstDist) {
        const schedule = generateScheduleBetween(firstDist, monthly, maturityDate, s.principalCents!);
        for (const d of schedule) {
          const paid = d.dueDate <= AS_OF;
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

async function main() {
  console.log('Resetting database…');
  await reset();
  console.log('Seeding team user…');
  await seedTeamUser();
  console.log('Seeding investors + notes + schedules…');
  await seedInvestors();
  // No sample documents — the Documents tab starts empty until the firm issues
  // real statements/agreements.
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
