# Agent guide — ACG Investor Portal (`acg-portal/`)

Instructions for coding agents (Codex, Claude Code, others) working in this
directory. The repo-root `AGENTS.md` covers the unrelated GSAP skills; this file
governs everything under `acg-portal/`.

## What this is

A private two-sided portal for a securities offering: investors see their note,
distribution schedule, documents, and profile; management (Team Console) creates
investor accounts, sets note terms, and issues logins. Next.js 15 App Router,
React 19, TypeScript, PostgreSQL via Prisma, custom session auth (Argon2id).
It handles investor PII — treat every change and every deploy accordingly.

## Commands

```bash
npm ci
npm run typecheck
npm test                         # Vitest unit tests
NODE_ENV=production npm run build
npm run db:deploy                # apply migrations (never `migrate dev` on shared DBs)
npm run test:e2e                 # needs a running, freshly seeded app on :3000
```

- Always build with `NODE_ENV=production`. A build with `NODE_ENV=development`
  in the environment fails on `/404`.
- Schema changes: edit `prisma/schema.prisma`, generate SQL with
  `prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`,
  save it as a new folder under `prisma/migrations/`, then `npm run db:deploy`.
- `npm run db:seed` **wipes the database**. Local and staging only.
- `prototype/index.html` is a single-file mock of the same UI. Keep it in step
  with product-visible changes to the app.

## Task: deploy to production on Cloudflare

Follow `CLOUDFLARE_DEPLOY.md` top to bottom. It is written to be executed as-is.

The public hostname is **`portal.acgroupinc.com`** (the `acgroupinc.com` zone is
already on Cloudflare). Ask the human for these before starting — do not invent
or look them up:

1. Shell access to the Docker host the portal will run on.
2. Confirmation that the Cloudflare tunnel exists and its token is already in
   `.env.production` on the server (or have them put it there).
3. Name and email for the first management login. Have them type the password
   into the `create-admin` command themselves, or generate one and show it once.

Done means all of:

- `docker compose -f docker-compose.cloudflare.yml --env-file .env.production ps`
  shows `db` and `app` healthy and `cloudflared` running.
- `curl -sI https://portal.acgroupinc.com/login` returns 200 with `strict-transport-security`.
- A management login created with `prisma/create-admin.mjs` can sign in.
- A database backup command has been run once and the dump file exists.

## Hard rules

- Never commit `.env`, `.env.production`, tunnel tokens, passwords, or database
  dumps. Never print secrets into logs, PRs, or chat.
- Never run `db:seed`, `db:reset`, or `prisma migrate dev` against production.
- Never add a `ports:` mapping to `docker-compose.cloudflare.yml` or otherwise
  expose the app or Postgres directly; the tunnel is the only entry point, and
  the client-IP logic in `src/lib/http.ts` depends on that.
- Don't weaken the security headers in `next.config.mjs`, the same-origin check
  in `src/lib/http.ts`, or cookie flags in `src/lib/session.ts` to make
  something work — find the real cause.
- Don't port the app to Workers/Pages as part of a deploy task; that is a
  separate, deliberate project (see "Why not Workers" in `CLOUDFLARE_DEPLOY.md`).
- Money is integer cents; rates are basis points. No floats in stored values.
- Every state-changing server action writes an audit record (`src/lib/audit.ts`).
  Keep that true for new ones.

## Where things are

| Area | Path |
|---|---|
| Auth, sessions, password policy | `src/lib/{auth,session,password}.ts` |
| Note schedule math (30-day distributions, maturity) | `src/lib/schedule.ts`, `src/lib/noteterms.ts` |
| Management actions (create account, note terms, credentials, profile) | `src/server/lifecycle.ts` |
| Investor view models | `src/server/portal.ts` |
| Team view models | `src/server/team.ts` |
| API routes | `src/app/api/**` |
| Deploy docs | `CLOUDFLARE_DEPLOY.md` (production), `STAGING_DEPLOY.md` (staging), `DEPLOY.md` (checklist) |
