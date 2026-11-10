# ACG Investor Portal & Team Console

A private, two-sided web application for **Amsterdam Capital Group (ACG)**, a
yield-focused alternative-credit firm. Investors hold a fixed-rate
**ACG Promissory Note**; the portal is where they view their note and manage the
relationship, and where ACG's Investor Relations (IR) team administers investors.

This is the **production application** built from the design handoff
(`DESIGN_HANDOFF.md`) and product/compliance brief (`DESIGN_BRIEF.md`). It
recreates the prototype 1:1 on a real stack: a real backend, real authentication,
a Cloudflare D1 database, server-side authorization, and an audit trail,
running on Cloudflare Workers at `portal.acgroupinc.com`.

> **Compliance note.** This is a securities offering handling PII. The product
> is always the "ACG Promissory Note." Returns are **fixed for the term — not
> guaranteed**; never present them as guaranteed. Banking changes are confirmed
> by phone; the portal records subscriptions and activates a note when the firm
> sets its terms to Active — it does not move money. See `DESIGN_BRIEF.md §9` and
> the Compliance section below.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Cloudflare Workers** via **OpenNext** (`@opennextjs/cloudflare`)
- **Cloudflare D1** (SQLite) through a small typed repository layer; every
  multi-row write is one atomic D1 `batch()` that includes its audit records
- **Custom session auth** — scrypt password hashing, DB-backed sessions in
  httpOnly/Secure/SameSite cookies, role-based access control, atomic
  per-account lockout, a shared D1 login throttle, CSRF (same-origin) checks,
  and an append-only audit log
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
  after the phone confirmation compliance requires) — is
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

Prerequisites: Node 20+. No database server or Docker is needed — local D1 runs
inside wrangler.

```bash
npm ci
cp .dev.vars.example .dev.vars     # local secrets for the Worker
npm run db:seed:local              # reset LOCAL D1, apply migrations, load demo data
npm run dev                        # next dev with local D1 bindings — http://localhost:3000
```

To run the real Worker build in workerd (what production runs):

```bash
npm run preview                    # opennextjs-cloudflare build + preview
```

`wrangler dev` treats requests as coming to the configured route
(`portal.acgroupinc.com`), so plain-HTTP local requests are redirected to
HTTPS. For browser testing of the built Worker, serve it over HTTPS on 443
and map the hostname to 127.0.0.1 (see `DEPLOY.md` → "Testing the Worker
locally"), or pass `--infer-origin-from-routes=false` and use localhost.

### Demo credentials (local seed only)

`npm run db:seed:local` creates two demo logins (override with `SEED_*` env vars):

| Side | Email | Password |
|---|---|---|
| Investor | `m.vance@gmail.com` | `ChangeMe!Inv1234` |
| Investor Relations | `james@acg.example` | `ChangeMe!Team123` |

The seed only ever targets local D1 and refuses `--remote`. Production is
never seeded: its first management login is created with `npm run
admin:create` (see `DEPLOY.md`).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Next dev server with local D1 bindings |
| `npm run build` | Next production build |
| `npm run build:worker` | OpenNext Worker build (`.open-next/`) |
| `npm run preview` | Build + run the Worker locally in workerd |
| `npm run deploy` | Build + deploy the Worker (production; see `DEPLOY.md`) |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply D1 migrations |
| `npm run db:seed:local` | Reset + seed LOCAL D1 with demo data |
| `npm run admin:create` | Create/reset a Team Console login (hidden password prompt) |
| `npm test` | Unit tests + D1 integration tests (real local D1) |
| `npm run test:e2e` | Playwright browser flows |
| `npm run typecheck` | `next typegen && tsc --noEmit` |

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
                               password(-core), audit, ratelimit, http, validation
  server/
    db/                        D1 types, binding access, typed read queries
    lifecycle.ts               every management write, each one atomic batch
    portal.ts team.ts shell.ts view-model loaders (server-only)
migrations/                    D1 schema (wrangler d1 migrations)
scripts/                       seed-local.ts (local only), create-admin.ts
worker.ts                      Worker entry: HTTPS redirect + OpenNext handler
wrangler.jsonc                 Worker, route, D1 binding
```

- **Money** is integer cents; **rates** are basis points. All formatting lives in
  `lib/money.ts` and `lib/dates.ts`.
- **View-models** (`src/server/*`) are the typed contract between server pages and
  view components; pages stay thin (`getPortalFrame()` / `getTeamFrame()`).
- **Mutations** go through real API routes that enforce auth + authorization +
  CSRF on every call. Each one is a single D1 batch with its audit records, so
  a failure or a concurrent request can never leave half a change (D1 has no
  interactive transactions; see `src/server/lifecycle.ts`).

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

- scrypt-hashed passwords (N=2^15, r=8, p=3), DB-backed sessions, atomic
  lockout, a shared D1 login throttle, same-origin CSRF checks, strict CSP and
  security headers, HTTP→HTTPS redirect at the Worker.
- Client IPs come only from Cloudflare's `CF-Connecting-IP`; a visitor's
  `X-Forwarded-For` is never trusted.
- Server-side authorization on every endpoint; investors are scoped to their own
  data, team by role. No client-side role trust.
- Append-only **audit log** (database triggers reject UPDATE/DELETE) for logins, state changes, note-term updates,
  credential provisioning, password changes, profile and banking edits,
  impersonation, and downloads.
- Documents are private — downloads require session + ownership, with a
  short-lived signed-URL option for out-of-band delivery.
- Copy honors the brief: "ACG Promissory Note," "fixed for the term — not
  guaranteed."

See **`DEPLOY.md`** for production on `portal.acgroupinc.com` (Cloudflare
Workers + D1): migrations, secrets, the first-admin bootstrap, deployment,
verification, operations and the pre-launch compliance checklist. Coding
agents: start with **`AGENTS.md`**.
