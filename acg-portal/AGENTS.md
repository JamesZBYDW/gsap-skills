# Agent guide — ACG Investor Portal (`acg-portal/`)

Instructions for coding agents (Codex, Claude Code, others) working in this
directory. The repo-root `AGENTS.md` covers the unrelated GSAP skills; this file
governs everything under `acg-portal/`.

## What this is

A private two-sided portal for a securities offering: investors see their note,
distribution schedule, documents and profile; management (Team Console) creates
investor accounts, sets note terms and issues logins.

- **Stack:** Next.js 15 App Router, React 19, TypeScript, on **Cloudflare
  Workers** via OpenNext, with **Cloudflare D1** as the database.
- **Production:** `https://portal.acgroupinc.com`.

It handles investor PII, so treat every change and every deploy accordingly.

## Commands

```bash
npm ci
cp .dev.vars.example .dev.vars   # local Worker secrets
npm run typecheck                # next typegen && tsc --noEmit
npm test                         # unit + D1 integration tests (throwaway local D1 copies)
npm run db:seed:local            # reset + seed LOCAL D1 (demo data)
npm run dev                      # next dev with local D1 bindings
npm run build:worker             # OpenNext Worker build → .open-next/
npm run preview                  # build + run the Worker in workerd
npm run test:e2e                 # browser flows (see DEPLOY.md "Testing the Worker locally")
```

- **Schema changes:** add a new numbered SQL file under `migrations/` (never
  edit an applied one) and apply it locally with `npm run db:migrate:local`.
  Keep each migration backward-compatible with the running release, since code
  rollbacks don't roll back D1.
- **Seed:** `npm run db:seed:local` wipes **local** D1 only and refuses any
  remote flag.
- **Prototype:** `prototype/index.html` is a single-file mock of the same UI.
  Keep it in step with product-visible changes to the app.

## Deploying

Follow `DEPLOY.md`. The operator with Cloudflare access does the release:
migrations, then secrets, then deploy, then the first-admin bootstrap, then
verification. The first administrator types their own password into
`npm run admin:create` (hidden prompt). Never put a real admin identity or any
credential in the repo, a commit, a PR or chat.

## Hard rules

- **Database writes:** every multi-row write is ONE D1 `batch()` that includes
  its audit rows (`src/server/lifecycle.ts`, `src/lib/auth.ts`).
  - D1 ignores interactive and implicit transactions. Never split a logical
    change across separate awaits, and don't introduce an ORM transaction
    emulation.
  - Inside a batch, refer to rows written earlier in the same batch by
    sub-select, not by values read beforehand.
  - Guard UPDATEs on the state you read (password hash, lock state, flags) so a
    concurrent change wins cleanly.
  - Keep each statement under D1's 100 bound parameters: one INSERT per
    schedule row.
- **Auth semantics stay intact:**
  - A failed login counts only while unlocked and against the current hash.
  - A successful login commits only if still unlocked with the verified hash.
  - Credential resets revoke sessions.
  - Changing any of this needs a matching regression test in
    `test/auth.d1.test.ts` / `test/lifecycle.d1.test.ts`.
- **Seeding:** never run `db:seed:local` against production, and never seed
  production in any other way.
- **Secrets:** never commit `.dev.vars`, exports, dumps, passwords or tokens.
  Never print secrets or password hashes into logs, PRs or chat. Error logs use
  `safeErrorSummary()`, never raw error messages (they can contain SQL or bound
  values).
- **Client IP:** comes from `CF-Connecting-IP` only (`src/lib/http.ts`). Never
  trust `X-Forwarded-For`.
- **Security posture:** don't weaken the security headers in
  `next.config.mjs`, the same-origin check in `src/lib/http.ts`, the cookie
  flags in `src/lib/session.ts`, or the HTTPS redirect in `worker.ts` to make
  something work. Find the real cause; a dev-port Origin mismatch is a test
  setup issue, not an app bug.
- **Passwords:** scrypt parameters live in `src/lib/password-core.ts` and in
  every stored hash. Raise them only together with the rehash path. Argon2 is
  not available in Workers' `node:crypto`, and PBKDF2 is capped below current
  guidance.
- **Money:** integer cents; rates in basis points. No floats in stored values.
- **Audit:** every state-changing action writes an audit record, and
  `audit_logs` stays append-only.
- **Scope:** don't change anything on the main `acgroupinc.com` website or
  other zone services. The portal uses only the `portal.acgroupinc.com`
  hostname.

## Where things are

| Area | Path |
|---|---|
| Worker entry (HTTPS redirect → OpenNext) | `worker.ts`, `src/lib/canonical.ts` |
| Worker / route / D1 config | `wrangler.jsonc`, `open-next.config.ts` |
| D1 schema | `migrations/` |
| D1 types, binding, read queries | `src/server/db/{d1,client,repo}.ts` |
| Management writes (atomic batches) | `src/server/lifecycle.ts` |
| Auth, sessions, lockout, throttle | `src/lib/{auth,session,ratelimit}.ts` |
| Password hashing (Worker + CLI) | `src/lib/password-core.ts` |
| Note schedule math | `src/lib/schedule.ts`, `src/lib/noteterms.ts` |
| View models | `src/server/{portal,team,shell}.ts` |
| API routes | `src/app/api/**` |
| Scripts | `scripts/seed-local.ts` (local only), `scripts/create-admin.ts` |
| Tests | `src/**/*.test.ts` (unit), `test/*.test.ts` (D1/workerd/CLI), `tests-e2e/` (browser) |
| Deploy runbook | `DEPLOY.md` |
