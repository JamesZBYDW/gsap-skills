# ACG Investor Portal — Staging Deployment (engineer guide)

A short, self-contained runbook to stand up a **staging** environment. Budget
~15–20 minutes. For deeper production guidance (backups, monitoring, compliance
checklist) see `DEPLOY.md` in this folder.

- **Repo:** `JamesZBYDW/gsap-skills`
- **Branch / PR:** `claude/prototype-to-production-nghtin` (PR #1)
- **App location:** ⚠️ the application lives in the **`acg-portal/` subdirectory**
  (the repo root is a separate GSAP-skills project). Set your deploy root /
  build context to `acg-portal/`.
- **Stack:** Next.js 15 (App Router) + React 19 + TypeScript · PostgreSQL + Prisma.
- You can deploy directly from the branch — no need to merge the draft PR first.

---

## 0. Prerequisites

- **Node 20+** and npm on whatever machine runs migrations/seed.
- A **PostgreSQL 14+** database for staging (managed is easiest: Neon, Supabase,
  RDS, Cloud SQL). Enable SSL.
- One of: a **Vercel** account (Path A) or a **Docker** host (Path B).

Generate two secrets (keep them out of git; put them in the host's env/secret store):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # DOCUMENT_URL_SECRET
```

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Staging Postgres, e.g. `postgresql://user:pass@host:5432/acg_portal?sslmode=require` |
| `SESSION_SECRET` | ✅ | 48+ random bytes (above). Rotating it invalidates all sessions. |
| `DOCUMENT_URL_SECRET` | ✅ | 48+ random bytes (above). Signs document download links. |
| `APP_URL` | ✅ | Public staging URL, e.g. `https://acg-staging.example.com` |
| `NODE_ENV` | ✅ | `production` (marks cookies Secure, enables HSTS) |

Do **not** set the `SEED_*` variables on the running app; they're only used by the
one-off seed step below.

---

## Path A — Vercel (recommended for staging)

1. Provision a staging Postgres (e.g. create a Neon project) and copy its
   connection string.
2. In Vercel: **New Project → import `JamesZBYDW/gsap-skills`**.
   - **Root Directory: `acg-portal`** (critical — click "Edit" and set it).
   - Framework preset auto-detects **Next.js**; leave the default build command.
   - Set the **Git branch** to `claude/prototype-to-production-nghtin`.
3. Add the environment variables from the table above (Project → Settings →
   Environment Variables), for the Preview/Staging environment.
4. **Run migrations** against the staging DB as a controlled step (not in the
   Vercel build). From a checkout on your machine or CI:
   ```bash
   cd acg-portal
   npm install
   DATABASE_URL="<staging-db-url>" npm run db:deploy   # prisma migrate deploy
   ```
5. **(Optional) Seed demo data** — see "Seeding" below. Do this once on a fresh DB.
6. Deploy. Add your staging domain under Project → Domains and point DNS as Vercel
   instructs (TLS is automatic).

> Note: the in-memory rate limiter is per-instance. On Vercel's serverless
> runtime that's fine for staging; for production back it with Redis/Upstash
> (see `DEPLOY.md`).

---

## Path B — Docker (any host)

The image runs `prisma migrate deploy` automatically on start, then boots the
standalone server.

```bash
cd acg-portal
docker build -t acg-portal:staging .

docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/acg_portal?sslmode=require" \
  -e SESSION_SECRET="…" \
  -e DOCUMENT_URL_SECRET="…" \
  -e APP_URL="https://acg-staging.example.com" \
  -e NODE_ENV=production \
  acg-portal:staging
```

Put it behind a TLS-terminating proxy / load balancer and route your staging
domain to it. (For a self-contained local trial, `docker compose up` also brings
up a bundled Postgres — but use a managed DB for real staging.)

Migrations run on container start; **seeding is a separate step** (below).

---

## Migrations & seeding

- **Migrations** (schema): `npm run db:deploy` (Path A) or automatic on container
  start (Path B). Migrations are versioned in `acg-portal/prisma/migrations`.
- **Seeding** (optional demo data): run from a full checkout with dev
  dependencies installed, pointed at the staging DB:
  ```bash
  cd acg-portal
  npm install
  DATABASE_URL="<staging-db-url>" \
  SEED_TEAM_EMAIL="ir@acg-staging.example" SEED_TEAM_PASSWORD="<pick-one>" \
  SEED_INVESTOR_EMAIL="investor@acg-staging.example" SEED_INVESTOR_PASSWORD="<pick-one>" \
  npm run db:seed
  ```

> ⚠️ **`db:seed` wipes and repopulates the database.** Run it only once, on a
> fresh staging DB you don't mind resetting. Never run it against production.

The seed creates two logins and a full sample book (matches the design
prototype): investor **Margaret Vance** ($250,000 · 18.0% · $3,750/mo · 14 of 24
paid) and an IR/admin team user. Credentials are whatever you passed above (or the
defaults in `.env.example` if you omit them).

---

## Post-deploy smoke test (2 min)

1. Open `APP_URL` → redirects to `/login`.
2. Sign in as the **Investor** (Margaret) → `/portal/overview` shows
   **$250,000**, **18.0%**, **$3,750**, "14 of 24 distributions paid", matures
   **April 14, 2027**.
3. Sign out; sign in as **Investor Relations** (team) → `/console/overview` shows
   the portfolio KPIs and approaching maturities. Open **Create account**, enter a
   test investor (details + note terms + login) and save; the new investor then
   signs in and is prompted to set their own password.
4. Confirm HTTPS and that the response carries `Strict-Transport-Security` and
   `Content-Security-Policy` headers (they're set in `next.config.mjs`).

If you want to run the automated checks against staging:

```bash
cd acg-portal && npm install
npm test                                   # 48 unit tests
E2E_BASE_URL="https://acg-staging.example.com" npm run test:e2e   # Playwright smoke
```

---

## Gotchas / notes

- **Root directory is `acg-portal/`** — the #1 thing to get right on Vercel and
  in Docker build context.
- Deploy from the branch; the PR being a **draft** does not block deployment.
- **Secrets are never in the repo** — set them in the host. `.env.example` lists
  every variable.
- Prisma engines download normally during `npm install` / build in a standard
  environment (no special setup).
- Documents download via a session-gated route; object-storage delivery and
  transactional email (password reset / invites) are scaffolded with clear TODOs
  in `DEPLOY.md` — not required for staging.

Questions on the code? The PR description (#1) summarizes the architecture,
security model, and verification.
