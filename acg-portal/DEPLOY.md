# Deploying the ACG Investor Portal

This portal handles PII for a securities offering. Treat the deployment as
regulated: HTTPS only, secrets in a manager (never in git), encrypted database
with backups, audit retention, and a counsel review of all investor-facing copy
and terms before launch.

## What you need

- A **PostgreSQL 14+** database (managed: Neon, RDS, Cloud SQL, Supabase).
- A host for the Next.js app: **Vercel** (simplest) or a container platform
  (AWS ECS/Fargate, Fly.io, Render, your own Docker host).
- Your domain + DNS access, and TLS (most hosts provision certificates).
- Secrets: `SESSION_SECRET`, `DOCUMENT_URL_SECRET` (48+ random bytes each),
  `DATABASE_URL`, `APP_URL`.

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Environment variables

See `.env.example`. In production set, at minimum:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string (use SSL: `?sslmode=require`). |
| `SESSION_SECRET` | 48+ random bytes. Rotating invalidates all sessions. |
| `DOCUMENT_URL_SECRET` | 48+ random bytes for signed document links. |
| `APP_URL` | Public HTTPS URL, e.g. `https://portal.acg.example`. |
| `NODE_ENV` | `production` (marks cookies Secure, enables HSTS). |

Do **not** set the `SEED_*` variables in production unless you intend to seed.

## Database migrations

Migrations are versioned in `prisma/migrations`. Apply them on every release:

```bash
npm run db:deploy        # prisma migrate deploy
```

Never run `migrate dev` against production. Seeding (`npm run db:seed`) is for
demo/staging only — it **wipes and repopulates** the database.

## Option A — Vercel

1. Import the repo; set the **root directory** to `acg-portal/`.
2. Add the environment variables above in Project Settings.
3. Build command is the default (`npm run build`, which runs `prisma generate`).
4. Run migrations as a release step — e.g. a GitHub Action on deploy, or a
   one-off `npx prisma migrate deploy` against the production `DATABASE_URL`.
   (Do not run migrations inside the Vercel build; run them as a controlled step.)
5. Add your domain in Vercel → Domains and point DNS (CNAME to Vercel, or A/ALIAS
   per Vercel's instructions). TLS is automatic.

The in-memory rate limiter is per-instance; on serverless, back it with
Redis/Upstash for correctness (swap `src/lib/ratelimit.ts`).

## Option B — Docker / container host

```bash
# Build
docker build -t acg-portal .

# Run (point at your managed Postgres)
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://USER:PASS@HOST:5432/acg_portal?sslmode=require" \
  -e SESSION_SECRET="…" -e DOCUMENT_URL_SECRET="…" \
  -e APP_URL="https://portal.acg.example" -e NODE_ENV=production \
  acg-portal
```

The image runs `prisma migrate deploy` on start, then the standalone server.
Put it behind a TLS-terminating load balancer / reverse proxy and route your
domain to it. For local end-to-end, `docker compose up` brings up Postgres + app.

## Pointing your domain

1. Create the DNS record your host specifies (CNAME/ALIAS for Vercel; A/AAAA or
   load-balancer CNAME for containers).
2. Set `APP_URL` to the final `https://…` host.
3. Verify HTTPS and that `Strict-Transport-Security` is present (it is, via
   `next.config.mjs`).

## Pre-launch checklist (compliance & security)

- [ ] Counsel has reviewed all investor-facing copy and the term/rate table.
- [ ] Real admin + investor credentials provisioned; seed/demo accounts removed.
- [ ] `SESSION_SECRET` / `DOCUMENT_URL_SECRET` set from a secret manager.
- [ ] Database encrypted at rest, TLS in transit, automated backups + tested restore.
- [ ] Audit log retention + export configured (`AuditLog` table).
- [ ] Banking-change process: out-of-band phone confirmation is enforced before
      any banking detail is applied (the portal records the request; it does not
      auto-apply).
- [ ] Distributed rate limiter (Redis) wired if running multi-instance/serverless.
- [ ] Email provider wired for password reset + investor onboarding invites
      (scaffolding present: `PasswordReset` model; provisioning is a TODO).
- [ ] 2FA enabled for team accounts (scaffolding present on `User`: `totpSecret`,
      `totpEnabled`).
- [ ] Document storage moved to access-controlled object storage (S3/GCS) with the
      signed-URL delivery in `src/lib/documents.ts`; never serve public URLs.
- [ ] Monitoring/alerting and error tracking configured.

## Notes on what is production-ready vs. scaffolded

**Ready:** auth (hashing, sessions, RBAC, lockout, rate limit, CSRF), the full
data model + lifecycle flows, server-side authorization on every endpoint, audit
logging, security headers/CSP, the complete UI.

**Scaffolded (clear extension points):** transactional email (password reset +
onboarding invites), TOTP 2FA enable/verify, object-storage document delivery,
and a distributed rate-limit store. Each is modeled in the schema/code with a
TODO so it can be finished without rework.
