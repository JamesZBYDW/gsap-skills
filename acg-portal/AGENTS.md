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

Production is **Cloudflare Containers + an external managed PostgreSQL**
(chosen by James). Follow `CLOUDFLARE_CONTAINERS_DEPLOY.md`. The Worker lives in
`cloudflare/` (its own `package.json`, `wrangler.jsonc`, tests). The Docker
server + Tunnel setup in `CLOUDFLARE_DEPLOY.md` is the alternative.

The public hostname is **`portal.acgroupinc.com`** (the `acgroupinc.com` zone is
already on Cloudflare). Get these from the human; do not invent them or create
them yourself:

1. Approval of the Workers Paid plan (Containers need it).
2. The managed Postgres provider/account and its connection strings (migration
   role and runtime role). They go into the operator's terminal and
   `wrangler secret put` prompts, never into files, chat or commits.
3. Name and email for the first management login. The human types the password.

Done means all of:

- Migrations applied and the first management login created from the operator's terminal.
- Worker secrets `DATABASE_URL`, `SESSION_SECRET`, `DOCUMENT_URL_SECRET` set.
- Deployed via Workers Builds (or a documented fallback).
- `curl -sI https://portal.acgroupinc.com/login` returns 200 with `strict-transport-security`.
- A cross-origin POST to `/api/auth/login` returns 403.
- The management login works in a browser.

Worker checks before pushing changes under `cloudflare/`:

```bash
cd cloudflare && npm ci && npm run typecheck && npm test
npx wrangler deploy --dry-run --outdir dist --containers-rollout none
```

## Hard rules

- Never commit `.env`, `.env.production`, tunnel tokens, passwords, or database
  dumps. Never print secrets into logs, PRs, or chat.
- Never run `db:seed`, `db:reset`, or `prisma migrate dev` against production.
- Never expose the app or Postgres directly. On Containers the Worker is the
  only entry point. On the Tunnel setup, never add a `ports:` mapping to
  `docker-compose.cloudflare.yml`. The client-IP logic in `src/lib/http.ts`
  depends on this.
- `DATABASE_URL` in production must keep `sslmode=require&sslaccept=strict`
  (`sslmode=require` alone does not verify the certificate) and must point at
  the external managed database; the Worker and the start script refuse
  anything else. Never put secrets in `wrangler.jsonc` or `vars`.
- Never ship an image built with a proxy/test CA injected (sandbox builds);
  production images come from the unmodified `Dockerfile`.
- The Worker logs fixed categories only, never runtime error text. Keep it
  that way.
- Don't weaken the security headers in `next.config.mjs`, the same-origin check
  in `src/lib/http.ts`, or cookie flags in `src/lib/session.ts` to make
  something work — find the real cause.
- Don't port the app itself to Workers/D1 as part of a deploy task. It runs
  unchanged in the container (see "Why not Workers" in `CLOUDFLARE_DEPLOY.md`).
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
| Cloudflare Worker for Containers | `cloudflare/src/portal.ts` (logic), `cloudflare/src/index.ts` (Durable Object), `cloudflare/wrangler.jsonc` |
| Container entrypoint | `scripts/container-start.mjs` |
| Deploy docs | `CLOUDFLARE_CONTAINERS_DEPLOY.md` (production), `CLOUDFLARE_DEPLOY.md` (Tunnel alternative), `STAGING_DEPLOY.md` (staging), `DEPLOY.md` (checklist) |
