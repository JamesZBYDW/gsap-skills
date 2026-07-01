# ACG Investor Portal & Team Console

A private, two-sided web application for **Amsterdam Capital Group (ACG)**, a
yield-focused alternative-credit firm. Investors hold a fixed-rate
**ACG Promissory Note**; the portal is where they view their note and manage the
relationship, and where ACG's Investor Relations (IR) team administers investors.

This is the **production application** built from the design handoff
(`DESIGN_HANDOFF.md`) and product/compliance brief (`DESIGN_BRIEF.md`). It
recreates the prototype 1:1 on a real stack: a real backend, real authentication,
a Postgres database, server-side authorization, and an audit trail.

> **Compliance note.** This is a securities offering handling PII. The product
> is always the "ACG Promissory Note." Returns are **fixed for the term — not
> guaranteed**; never present them as guaranteed. Banking changes are confirmed
> by phone; the portal records subscriptions and activates a note when the firm
> sets its terms to Active — it does not move money. See `DESIGN_BRIEF.md §9` and
> the Compliance section below.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **PostgreSQL** + **Prisma** ORM
- **Custom session auth** — Argon2id password hashing, DB-backed sessions in
  httpOnly/SameSite cookies, role-based access control, per-account lockout,
  per-IP rate limiting, CSRF (same-origin) checks, and an immutable audit log
- **Self-hosted Manrope** font (no external CDN); strict Content-Security-Policy
- **Vitest** unit tests + **Playwright** e2e smoke

## The two sides

| Investor portal (`/portal/*`) | Team console (`/console/*`) |
|---|---|
| Overview (note dashboard **+ full distribution ledger**, one page) | Portfolio overview |
| Documents (access-controlled; starts empty until the firm issues them) | Investors roster + detail |
| Profile (banking, notifications, change password) | **Create account** (details + terms + login) |
| | Investor detail: **set note terms** + **provision login** |

Access is gated by real permissions (no client-side role trust). Investors see
only their own note, schedule, and documents. Management creates each investor's
account, provisions their login, and sets their note terms. Team members are
scoped by role. A TEAM admin can open an investor's portal **read-only** (audited
impersonation) for support — all mutations are blocked while impersonating.

There is no self-registration and no in-app messaging: management stands up every
account, and out-of-band contact (email/phone) is used for anything conversational.

### Accounts, logins & note terms (management-driven)

- **Management creates the whole account** from the **Create account** tab in one
  step: investor details (name, contact email, phone, type), note terms, and the
  sign-in credentials the investor will use.
- **Management owns the investor's profile data.** Everything the investor sees
  read-only on their Profile page — identity, phone, banking on file (recorded
  after the phone confirmation compliance requires), and W-9 — is
  entered at creation or edited later from the investor's detail panel.
- **Investor logins are provisioned by management** (from Create account, or later
  from an investor's detail panel): a login email + an initial password (or a
  generated one), hashed and persisted for real sign-in. On their **first sign-in**
  the investor is **forced to set their own password** before they can enter the
  portal; they can change it again anytime in Profile.
- **Management enters four things** — principal, fixed rate, term (1 / 1.5 / 2 /
  3 years), and the **wire-received date**. Everything else derives: the
  per-distribution amount (principal × rate ÷ 12), the **first distribution**
  (wire + 30 days), each subsequent distribution **every 30 days**, the maturity
  date (wire + term), and the **status** — Awaiting until the wire is recorded,
  **Active** the moment it is, and **Expired** after the final distribution,
  which also **returns the principal**. Saving regenerates the schedule, which
  the investor sees right on their Overview.
- **90-day expiry notice** — inside the 90-day pre-expiry window the investor's
  Overview shows a maturity notice (in place of the monthly-income tile), and
  management sees the note in the team overview's "Maturing ≤ 90 days" panel.

## Local development

Prerequisites: Node 20+, a running PostgreSQL (or use Docker).

```bash
cp .env.example .env            # then edit secrets (see below)

# Option A — Postgres via Docker
docker compose up -d db

# Install + set up the database
npm install
npm run db:migrate              # apply migrations
npm run db:seed                 # seed the prototype's sample data

npm run dev                     # http://localhost:3000
```

Generate strong secrets for `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # DOCUMENT_URL_SECRET
```

### Demo credentials (from the seed)

The seed creates two logins (passwords come from `.env`, defaults shown):

- **Investor** — `m.vance@gmail.com` / `ChangeMe!Inv1234` (Margaret Vance,
  $250,000 @ 18%, 24-month note, 14 of 24 distributions paid — matches the
  prototype exactly).
- **Team** — `james@acg.example` / `ChangeMe!Team123` (IR admin).

Change these before any non-demo deployment.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Run the production build |
| `npm run db:migrate` | Create/apply migrations (dev) |
| `npm run db:deploy` | Apply migrations (prod/CI) |
| `npm run db:seed` | Seed sample data |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright smoke tests |
| `npm run typecheck` | `tsc --noEmit` |

## Architecture

```
src/
  app/
    login/                     auth gate (sign in only — no self-registration)
    change-password/           forced first-login password set
    portal/                    investor side (layout guard + views)
    console/                   team side (layout guard + views, incl. Create account)
    api/                       REST endpoints (auth, profile, team/*)
  components/
    shell/                     Sidebar, TopBar, AppShell
    portal/  team/             view components (1:1 with the prototype)
    ui/                        Pill, Toggle, Modal, SlideOver, Toast
    Icon.tsx                   feather-style SVG icons
  lib/                         money, rates, schedule, dates, auth, session,
                               password, audit, ratelimit, http, validation
  server/                     view-model loaders + lifecycle services (server-only)
prisma/                       schema + migrations + seed
```

- **Money** is integer cents; **rates** are basis points. All formatting lives in
  `lib/money.ts` and `lib/dates.ts`.
- **View-models** (`src/server/*`) are the typed contract between server pages and
  view components; pages stay thin (`getPortalFrame()` / `getTeamFrame()`).
- **Mutations** go through real API routes that enforce auth + authorization +
  CSRF on every call and write audit records for sensitive actions.

## Key flows (end-to-end, through real APIs)

1. **Create account (one step):** from the **Create account** tab, management
   enters the investor's details, note terms, and login credentials → the
   investor record, note, generated schedule, and hashed login are all created.
2. **Forced first sign-in:** the investor signs in with the management-issued
   credentials against real database records → is **forced to set their own
   password** before entering the portal → can change it again later in Profile.
3. **Management sets/updates the note terms** (principal, rate, term, and the
   wire-received date; amount, first distribution, maturity, and status are all
   derived) — at creation or later from the investor's detail panel → the
   **schedule regenerates** (first distribution 30 days after the wire, then
   every 30 days; the final one returns the principal) → the investor sees it
   directly on their Overview, with a maturity notice in the last 90 days.

## Compliance & security

- Hashed passwords (Argon2id), DB-backed sessions, lockout + rate limiting,
  same-origin CSRF checks, strict CSP and security headers.
- Server-side authorization on every endpoint; investors are scoped to their own
  data, team by role. No client-side role trust.
- Immutable **audit log** for logins, state changes, note-term updates,
  credential provisioning, password changes, approvals, banking edits,
  impersonation, and downloads.
- Documents are private — downloads require session + ownership, with a
  short-lived signed-URL option for out-of-band delivery.
- Copy honors the brief: "ACG Promissory Note," "fixed for the term — not
  guaranteed."

See **`DEPLOY.md`** for production deployment, secrets, migrations, backups, and
a pre-launch compliance checklist.
