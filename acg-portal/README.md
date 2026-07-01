# ACG Investor Portal & Team Console

A private, two-sided web application for **Amsterdam Capital Group (ACG)**, a
yield-focused alternative-credit firm. Accredited investors hold a fixed-rate
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
| Overview (note dashboard) | Portfolio overview |
| Schedule & ledger | Investors roster + detail |
| Messages (IR concierge chat) | Registrations queue (approve/decline) |
| Documents (access-controlled) | Messages (per-investor chat + broadcast) |
| Profile (banking, accreditation, notifications, change password) | Investor detail: **set note terms** + **provision login** |

Access is gated by real permissions (no client-side role trust). Investors see
only their own note, messages, and documents, and chat only with management.
Management chats with any investor, provisions each investor's login, and sets
their note terms. Team members are scoped by role. A TEAM admin can open an
investor's portal **read-only** (audited impersonation) for support — all
mutations are blocked while impersonating.

### Logins & note terms (management-driven)

- **Investor logins are provisioned by management.** From an investor's detail
  panel, management sets the login email + an initial password (or generates
  one); the investor can change it later in Profile. Credentials are hashed and
  persisted for future sign-in.
- **Management sets the note terms** — principal, fixed rate, status, first
  distribution date, recurring day-of-month, distribution amount, and maturity.
  Saving regenerates the distribution schedule, which the investor sees on their
  Overview and Schedule.

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
    login/                     auth gate (sign in + request access)
    portal/                    investor side (layout guard + views)
    console/                   team side (layout guard + views)
    api/                       REST endpoints (auth, messages, profile, team/*)
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

1. **Request access → Registrations queue → Approve → Investor (Awaiting).**
2. **Management provisions the investor's login** (email + initial password) →
   the investor signs in against real database credentials → changes their
   password in Profile.
3. **Management sets the note terms** (principal, rate, status, first
   distribution date, recurring day, amount, maturity) → the distribution
   **schedule regenerates** → the investor sees it on Overview + Schedule.
4. **Chat:** management messages any investor; each investor chats only with
   management; unread indicators both sides + a team **broadcast** to all active
   investors.

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
  guaranteed," accredited-investor acknowledgment persisted with a timestamp.

See **`DEPLOY.md`** for production deployment, secrets, migrations, backups, and
a pre-launch compliance checklist.
