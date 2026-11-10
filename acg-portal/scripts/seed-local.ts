/* eslint-disable no-console */
// LOCAL-ONLY demo seed for development and tests.
//
//   npm run db:seed:local                 # resets .wrangler/state D1, migrates, seeds
//   npm run db:seed:local -- --persist-to <dir>
//
// It always targets the local D1 that `wrangler dev` / `opennextjs-cloudflare
// preview` use, and refuses any remote flag. It wipes the local database
// first. Never run anything like it against production.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { deriveRateBps } from '../src/lib/rates';
import { monthlyDistributionCents } from '../src/lib/money';
import { generateScheduleBetween, computeMaturity, distributionReference } from '../src/lib/schedule';
import { utcDate, addDays } from '../src/lib/dates';
import { hashPassword } from '../src/lib/password-core';
import type { InvestorState, InvestorType } from '../src/lib/domain';

const DB_NAME = 'acg-portal-production'; // resolved to the LOCAL copy via --local
const root = resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.some((a) => /^--(remote|preview)\b/.test(a) || a === '-r')) {
  console.error('seed-local: refusing — this seed only ever targets the local D1 database.');
  process.exit(2);
}
const persistIdx = args.indexOf('--persist-to');
const persistTo = persistIdx >= 0 ? resolve(args[persistIdx + 1] ?? '') : resolve(root, '.wrangler/state');

// Fixed "as of" date so the demo is deterministic (Margaret shows 14 of 24
// paid regardless of the real clock).
const AS_OF = new Date(Date.UTC(2026, 5, 30)); // Jun 30, 2026
const $ = (dollars: number) => Math.round(dollars * 100);

interface SeedInvestor {
  legalName: string;
  type: InvestorType;
  email: string;
  phone?: string;
  state: InvestorState;
  principalCents?: number;
  termMonths?: number;
  wireDate?: Date | null;
  login?: { password: string };
  banking?: { bankName: string; last4: string; method: string };
  notif?: { distributionPosted: boolean; maturityReminder: boolean };
}

const investors: SeedInvestor[] = [
  {
    legalName: 'Margaret Vance',
    type: 'INDIVIDUAL',
    email: process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com',
    phone: '(212) 555·0148',
    state: 'ACTIVE',
    principalCents: $(250_000),
    termMonths: 24,
    wireDate: utcDate(2025, 3, 14),
    login: { password: process.env.SEED_INVESTOR_PASSWORD ?? 'ChangeMe!Inv1234' },
    banking: { bankName: 'Chase', last4: '6042', method: 'ACH · monthly' },
    notif: { distributionPosted: true, maturityReminder: true },
  },
  { legalName: 'Vance Family Office', type: 'ENTITY', email: 'ops@vancefo.com', state: 'ACTIVE', principalCents: $(1_200_000), termMonths: 24, wireDate: utcDate(2025, 4, 2) },
  { legalName: 'Harold & Anne Beckett', type: 'INDIVIDUAL', email: 'beckett@me.com', state: 'ACTIVE', principalCents: $(500_000), termMonths: 36, wireDate: utcDate(2023, 6, 21) },
  { legalName: 'Crest Harbor Holdings', type: 'ENTITY', email: 'admin@crestharbor.com', state: 'AWAITING', principalCents: $(750_000), termMonths: 18, wireDate: null },
  { legalName: 'Dr. Lena Okafor', type: 'INDIVIDUAL', email: 'l.okafor@clinic.org', state: 'ACTIVE', principalCents: $(300_000), termMonths: 24, wireDate: utcDate(2024, 8, 12) },
  { legalName: 'Juniper Trust', type: 'ENTITY', email: 'trustee@junipertrust.org', state: 'ACTIVE', principalCents: $(2_000_000), termMonths: 36, wireDate: utcDate(2023, 8, 28) },
  { legalName: 'Marcus Bell', type: 'INDIVIDUAL', email: 'mbell@gmail.com', state: 'DECLINED' },
];

const q = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(Math.trunc(v)) : `'${v.replace(/'/g, "''")}'`;
const row = (table: string, values: Record<string, string | number | null | undefined>) =>
  `INSERT INTO ${table} (${Object.keys(values).join(', ')}) VALUES (${Object.values(values).map(q).join(', ')});`;

async function buildSql(): Promise<string> {
  const out: string[] = [];
  let clock = Date.UTC(2026, 0, 1); // stable created_at ordering
  const tick = () => clock++;

  const teamAt = tick();
  out.push(
    row('users', {
      id: randomUUID(),
      role: 'TEAM',
      name: 'James',
      email: (process.env.SEED_TEAM_EMAIL ?? 'james@acg.example').toLowerCase(),
      password_hash: await hashPassword(process.env.SEED_TEAM_PASSWORD ?? 'ChangeMe!Team123'),
      created_at: teamAt,
      updated_at: teamAt,
    }),
  );

  for (const s of investors) {
    const at = tick();
    const investorId = randomUUID();
    let userId: string | null = null;
    if (s.login) {
      userId = randomUUID();
      out.push(
        row('users', {
          id: userId,
          role: 'INVESTOR',
          name: s.legalName,
          email: s.email.toLowerCase(),
          password_hash: await hashPassword(s.login.password),
          phone: s.phone ?? null,
          created_at: at,
          updated_at: at,
        }),
      );
    }
    out.push(
      row('investors', {
        id: investorId,
        legal_name: s.legalName,
        type: s.type,
        email: s.email,
        phone: s.phone ?? null,
        state: s.state,
        user_id: userId,
        created_at: at,
        updated_at: at,
      }),
    );
    if (s.banking) {
      out.push(row('banking_details', { id: randomUUID(), investor_id: investorId, bank_name: s.banking.bankName, last4: s.banking.last4, method: s.banking.method, updated_at: at }));
    }
    if (s.notif) {
      out.push(row('notif_prefs', { id: randomUUID(), investor_id: investorId, distribution_posted: s.notif.distributionPosted ? 1 : 0, maturity_reminder: s.notif.maturityReminder ? 1 : 0, updated_at: at }));
    }
    if (s.principalCents != null && s.termMonths != null) {
      const rateBps = deriveRateBps(s.termMonths);
      const monthly = monthlyDistributionCents(s.principalCents, rateBps);
      const wire = s.wireDate ?? null;
      const maturity = wire ? computeMaturity(wire, s.termMonths) : null;
      const first = wire ? addDays(wire, 30) : null;
      const active = s.state === 'ACTIVE' && !!wire;
      const noteId = randomUUID();
      out.push(
        row('notes', {
          id: noteId,
          investor_id: investorId,
          principal_cents: s.principalCents,
          rate_bps: rateBps,
          term_months: s.termMonths,
          monthly_amount_cents: monthly,
          wire_date: wire?.getTime(),
          first_distribution_date: first?.getTime(),
          maturity_date: maturity?.getTime(),
          distribution_day: first ? first.getUTCDate() : 1,
          status: active ? 'ACTIVE' : 'AWAITING',
          created_at: at,
          updated_at: at,
        }),
      );
      if (active && first) {
        for (const d of generateScheduleBetween(first, monthly, maturity, s.principalCents)) {
          const paid = d.dueDate <= AS_OF;
          out.push(
            row('distributions', {
              id: randomUUID(),
              note_id: noteId,
              idx: d.index,
              due_date: d.dueDate.getTime(),
              amount_cents: d.amountCents,
              paid_date: paid ? d.dueDate.getTime() : null,
              reference: paid ? distributionReference(d.index) : null,
            }),
          );
        }
      }
    }
  }
  return `${out.join('\n')}\n`;
}

function wrangler(...wargs: string[]) {
  const r = spawnSync('npx', ['wrangler', ...wargs, '--local', '--persist-to', persistTo], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`wrangler ${wargs[0]} ${wargs[1]} failed`);
  }
}

async function main() {
  console.log(`Resetting LOCAL D1 under ${persistTo} …`);
  rmSync(join(persistTo, 'v3', 'd1'), { recursive: true, force: true });
  wrangler('d1', 'migrations', 'apply', DB_NAME);
  const dir = mkdtempSync(join(tmpdir(), 'acg-seed-'));
  const file = join(dir, 'seed.sql');
  try {
    writeFileSync(file, await buildSql(), { mode: 0o600 });
    wrangler('d1', 'execute', DB_NAME, '--file', file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log('Local seed complete (demo data only).');
  console.log(`  Investor login: ${process.env.SEED_INVESTOR_EMAIL ?? 'm.vance@gmail.com'}`);
  console.log(`  Team login:     ${process.env.SEED_TEAM_EMAIL ?? 'james@acg.example'}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
