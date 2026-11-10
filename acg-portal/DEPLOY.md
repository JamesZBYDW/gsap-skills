# Deploying the ACG Investor Portal — Cloudflare Workers + D1

Production runs at **`https://portal.acgroupinc.com`** as one Cloudflare Worker
(`acg-portal`) with one D1 database (`acg-portal-production`). There is no
server, container or external database. The portal handles PII for a
securities offering, so treat every step as regulated.

```
visitor ──HTTPS──▶ Cloudflare edge (portal.acgroupinc.com) ──▶ Worker "acg-portal" ──▶ D1 "acg-portal-production"
                                                               worker.ts → OpenNext (Next.js 15)
```

| Fixed in `wrangler.jsonc` | Value |
|---|---|
| Account | `983099337aea87f2c4470be788687a81` |
| Worker | `acg-portal` |
| Route | custom domain `portal.acgroupinc.com` (`workers_dev` and `preview_urls` off) |
| D1 binding | `DB` → `acg-portal-production` (`f105d819-33be-4a1e-a165-1351d135b316`) |
| Var | `APP_URL = https://portal.acgroupinc.com` |

Only the `portal` hostname is used. Nothing here changes the main
`acgroupinc.com` website or any other service in that zone.

## What the app guarantees

| Area | How |
|---|---|
| Atomic writes | Every management write (create account, note terms + schedule, credentials, profile/banking, passwords) is **one D1 `batch()`** including its audit rows. D1 ignores interactive transactions, so nothing relies on them. A failed statement rolls the whole change back; concurrent requests can only leave one request's complete result. |
| Money | Integer cents; rates in basis points. No floats are stored. |
| Passwords | scrypt (`node:crypto`, N=2^15, r=8, p=3, 64 MiB maxmem), parameters stored in each hash. Verified live in a Cloudflare Worker. |
| Login protection | Per-account lockout (5 failures → 15 min), counted atomically and only while unlocked and against the current password. A per-IP throttle (20 per 10 min) uses a shared D1 counter. Success is committed only if the account is still unlocked with the password just verified. |
| Sessions | Opaque random tokens; only SHA-256 hashes are stored. Cookies are `HttpOnly; Secure; SameSite=Lax`. A credential reset revokes the login's sessions. |
| CSRF | Every mutation requires `Origin`/`Referer` to match the host. |
| Client IP | `CF-Connecting-IP` only; `X-Forwarded-For` is never trusted. |
| HTTPS | The Worker 308-redirects `http://portal.acgroupinc.com/*` to HTTPS. The app sends HSTS and a strict CSP. |
| Audit | `audit_logs` is append-only: database triggers reject UPDATE and DELETE. |
| Logs | Error logs carry categories only, never SQL, values or hashes. |
| Documents | Session- and ownership-gated. Signed links work only when `DOCUMENT_URL_SECRET` (32+ chars) is set, and fail closed otherwise. |

## Release procedure (operator with Cloudflare access)

Run from `acg-portal/` with `npm ci` done and `npx wrangler whoami` showing the
ACG account.

### 1. Apply database migrations

```bash
npx wrangler d1 migrations list acg-portal-production --remote   # what is pending
npm run db:migrate:remote                                         # apply
```

Migrations live in `migrations/` and are applied before the code that needs
them. **Never run `npm run db:seed:local` with remote flags**: it refuses them,
and production is never seeded.

### 2. Secrets

```bash
openssl rand -base64 48 | tr '+/' '-_' | tr -d '=' | npx wrangler secret put DOCUMENT_URL_SECRET
```

The value goes straight into Cloudflare and is never displayed.
`DOCUMENT_URL_SECRET` signs short-lived document links; without it, those
links are disabled and downloads require a session. `SESSION_SECRET` is
**not used** by the current code (sessions are database-backed tokens) and
doesn't need to be set. Don't set `DEMO_LOGIN_EMAIL` in production.

### 3. Deploy

```bash
npm run deploy        # opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

This builds the Worker (`.open-next/`, wrapped by `worker.ts`) and deploys
`acg-portal` with the `portal.acgroupinc.com` custom domain. Check first with:

```bash
npm run build:worker && npx wrangler deploy --dry-run --outdir .open-next/dry-run
```

### 4. First management login (once; the administrator types the password)

```bash
npm run admin:create -- --remote --email <admin email> --name "<Full Name>"
```

The password is read from the terminal with echo off and asked for twice. It
must be at least 8 characters with letters and numbers (the same policy as
every portal password: `src/lib/password-policy.ts`). It is never printed,
logged or written to disk. Only its scrypt hash is sent to D1, and the
wrangler child process runs with `WRANGLER_WRITE_LOGS=false` and
`WRANGLER_LOG_SANITIZE=true`.

Re-running with the same email resets that password, clears any lockout and
ends all of that login's sessions. An email belonging to an investor login is
refused. The bootstrap is recorded as `ADMIN_BOOTSTRAP` in the audit log.
Investors are then created in the console (**Create account**).

### 5. Verify

```bash
curl -sI https://portal.acgroupinc.com/login | grep -iE '^HTTP|strict-transport|content-security'  # 200 + both headers
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://portal.acgroupinc.com/login         # 308 → https://…/login
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://portal.acgroupinc.com/portal/overview  # 307 → /login
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://portal.acgroupinc.com/console/overview # 307 → /login
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://portal.acgroupinc.com/api/auth/login \
  -H 'Origin: https://evil.example' -H 'Content-Type: application/json' --data '{}'               # 403
```

Then sign in as the management user in a browser. Create the first real
investor, then sign in as that investor; they're forced to change their
password, then see their schedule.

## Cloudflare settings for the portal hostname

Scope these to **`portal.acgroupinc.com` only**, using Configuration Rules or a
hostname filter, so the main `acgroupinc.com` website is untouched:

| Setting | Value | Why |
|---|---|---|
| Email Address Obfuscation | Off | It rewrites email addresses in HTML (investor roster, profile). |
| Rocket Loader | Off | Rewrites scripts; conflicts with the strict CSP. |
| Cache | No "Cache Everything" | Pages are per-user. |
| WAF rate-limit rule | `/api/auth/login`, e.g. 10/min/IP | Edge backstop for the app's own throttle. |
| Minimum TLS | 1.2 | Financial PII. Zone-wide, so check with the website owner first. |

The Worker already redirects HTTP to HTTPS for this hostname, so the zone-wide
"Always Use HTTPS" isn't required.

## Operations

- **Release:** migrations (step 1) → `npm run deploy` → verify (step 5).
- **Rollback code:** `npx wrangler rollback` (Workers versions). Database
  migrations are not rolled back by this. Write migrations to be
  backward-compatible with the previous release.
- **Backups:** D1 Time Travel gives point-in-time restore
  (`npx wrangler d1 time-travel info acg-portal-production`). Also take a
  periodic export to storage you control:
  `npx wrangler d1 export acg-portal-production --remote --output acg-<date>.sql`
  (it contains PII and password hashes; encrypt and restrict it).
- **Logs:** `npx wrangler tail acg-portal`, or Workers Observability in the
  dashboard.
- **Secret rotation:** rotating `DOCUMENT_URL_SECRET` invalidates outstanding
  signed document links only.
- **Expired sessions** are deleted when they're next presented. A scheduled
  `pruneExpiredSessions()` (Cron Trigger) is a follow-up.

## Testing the Worker locally

```bash
npm ci && cp .dev.vars.example .dev.vars
npm run db:seed:local
npm run build:worker
npx wrangler dev --port 443 --ip 127.0.0.1 --local-protocol https   # needs permission to bind :443
```

`wrangler dev` treats requests as addressed to the route
(`portal.acgroupinc.com`). Map that name to 127.0.0.1, for example with
Chromium's `--host-resolver-rules=MAP portal.acgroupinc.com 127.0.0.1`, and test
against `https://portal.acgroupinc.com`.

Alternatively, run
`npx wrangler dev --infer-origin-from-routes=false --port 8790` and use
`http://localhost:8790`. Either way the browser's `Origin` matches the `Host`,
so the CSRF check works as written.

Don't test on a different port with the canonical host: the browser's
`Origin` then includes the port and every POST is rightly rejected.

Automated checks:

```bash
npm run typecheck
npm test            # unit + D1 integration (atomicity, races, rollback, lockout, throttle,
                    # CLI, scrypt in workerd) — uses throwaway local D1 copies
E2E_BASE_URL=… npx playwright test   # the five browser workflows
```

## Pre-launch checklist (compliance & security)

- [ ] Counsel has reviewed all investor-facing copy and the term/rate table.
- [ ] Production has no demo data. It is never seeded, and the first login comes from `admin:create`.
- [ ] `DOCUMENT_URL_SECRET` set; `DEMO_LOGIN_EMAIL` not set.
- [ ] D1 Time Travel window confirmed against retention needs, and a periodic encrypted export is in place.
- [ ] Audit log retention and export procedure agreed (`audit_logs` is append-only).
- [ ] Banking-change process: Investor Relations confirms every banking change with the investor by phone (out of band) before recording it in the investor's detail panel. The portal does not enforce that call; it's a written procedure, but every edit is audited as `BANKING_EDIT`.
- [ ] Hostname-scoped zone settings applied (table above).
- [ ] Email provider for password reset and investor invites (scaffolding: `password_resets` table; provisioning is a TODO).
- [ ] 2FA for team accounts (scaffolding on `users`: `totp_secret`, `totp_enabled`).
- [ ] Executed documents stored in access-controlled object storage (e.g. R2), served through the existing session/signed-link route; never public URLs.
- [ ] Monitoring and alerting on Worker errors.

## Production-ready vs scaffolded

**Ready:** auth (scrypt, sessions, RBAC, atomic lockout, shared throttle,
CSRF), the full data model and atomic lifecycle writes, server-side
authorization on every endpoint, append-only audit logging, security
headers/CSP, HTTPS redirect, and the complete UI.

**Scaffolded:** transactional email (password reset, invites), TOTP 2FA,
object-storage document delivery, and scheduled session pruning.
