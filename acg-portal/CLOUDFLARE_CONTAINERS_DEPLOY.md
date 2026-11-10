# Production: portal.acgroupinc.com on Cloudflare Containers

This is the chosen production setup: the unchanged app image runs in a
**Cloudflare Container**, behind a **Worker** on `portal.acgroupinc.com`, with an
**external managed PostgreSQL** over verified TLS. No server to run, no public
origin port, and no database on the container's disk.

(`CLOUDFLARE_DEPLOY.md` describes the alternative: a self-hosted Docker server
behind a Cloudflare Tunnel.)

```
visitor ──HTTPS──▶ Cloudflare edge ──▶ Worker "acg-portal" ──▶ Durable Object "production" ──▶ container :3000 ──TLS──▶ managed Postgres
                   portal.acgroupinc.com   (cloudflare/src)        (one instance)                (Dockerfile)      (sslaccept=strict)
```

## What the Worker guarantees (`cloudflare/src/portal.ts`)

| Guarantee | How |
|---|---|
| Only `portal.acgroupinc.com` is served | Any other hostname gets 404. The config has `workers_dev: false`, `preview_urls: false` and a custom-domain route. |
| HTTPS only | Plain HTTP gets a 308 redirect to `https://`. |
| One app instance | Every request goes to `env.PORTAL.getByName('production')`. `max_instances: 1`, because the login rate limiter keeps its state in memory. |
| Trusted visitor IP | `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`, `Forwarded`, `X-Forwarded-Host/Proto/Port` and `x-middleware-subrequest` are stripped. The edge-set `CF-Connecting-IP` is the only client IP passed on. |
| Auth/CSRF unchanged | Requests reach the container with `Host: portal.acgroupinc.com`. The browser's `Origin` is passed through untouched, so the app's existing same-origin check works as written. |
| No database on the container | The Worker won't start the container unless `DATABASE_URL` points at an external host with `sslmode=require&sslaccept=strict`. `scripts/container-start.mjs` repeats the check inside the image. |
| Verified database TLS | Prisma's `sslmode=require` on its own encrypts but **accepts any certificate** (tested). `sslaccept=strict` verifies it against the image's CA store (`ca-certificates` is installed in the runner stage). |
| Secrets stay secret | `DATABASE_URL`, `SESSION_SECRET` and `DOCUMENT_URL_SECRET` are Worker secrets, passed only through `ctx.container.start({ env })`. Logs contain fixed categories and numeric exit codes, never error text or config values. |
| No admin backdoor | There is no admin HTTP endpoint. Migrations and the first login are run from an operator's terminal straight against the database (below). |
| Cold start | Started on demand with one shared startup promise. Each readiness probe is bounded (5 s, aborted on timeout) within an overall 90 s deadline. The container sleeps after `IDLE_TIMEOUT_MINUTES` (30) without traffic, and the next visitor waits roughly 2–4 s. |

Application requests are forwarded once and **never retried**.

## Before the first deploy: decisions and accounts (human)

1. **Cloudflare plan:** Containers require **Workers Paid** on the account that
   holds `acgroupinc.com`. Upgrading is a billing decision for James.
2. **Managed PostgreSQL:** pick the provider and region (close to the visitors),
   and create:
   - database `acg_portal`;
   - a **migration role** that owns the schema (used only from an operator's terminal);
   - optionally, a separate **runtime role** with only data permissions
     (`SELECT, INSERT, UPDATE, DELETE` on all tables, `USAGE` on the schema) for
     the Worker secret. If you use one role, it is both.

   The server certificate must chain to a public CA (Debian's CA store). If the
   provider uses its own CA (e.g. some Supabase and RDS setups), the CA file has
   to be added to the image and referenced with `sslcert=` before go-live.
   Treat that as a code change.
3. **First management login:** the name and email of the person who will
   administer the Team Console.

Connection string format (both roles):

```
postgresql://USER:PASSWORD@HOST:5432/acg_portal?schema=public&sslmode=require&sslaccept=strict&connection_limit=5
```

## Step 1 — Apply migrations (operator's Mac, no Docker)

```bash
cd acg-portal
npm ci
read -rs DATABASE_URL && export DATABASE_URL     # paste the MIGRATION role URL; not echoed or saved in history
npx prisma migrate deploy
unset DATABASE_URL
```

Run this before every release that adds a migration. The container does not run
migrations on start in this setup (`MIGRATE_ON_START=0`).

## Step 2 — Create the first management login (operator's Mac)

```bash
cd acg-portal
read -rs DATABASE_URL && export DATABASE_URL
export ADMIN_EMAIL='name@acgroupinc.com' ADMIN_NAME='Full Name'
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD   # 12+ chars, letters and numbers
node prisma/create-admin.mjs
unset DATABASE_URL ADMIN_PASSWORD
```

Re-running with the same email resets that password, signs the user out
everywhere and clears any lockout. Investors are created in the console
(**Create account**). **Never run `npm run db:seed` against production**: it
wipes the database.

## Step 3 — Worker secrets (operator's Mac)

```bash
cd acg-portal/cloudflare
npm ci
npx wrangler secret put DATABASE_URL          # paste the RUNTIME role URL at the prompt
openssl rand -base64 48 | tr '+/' '-_' | tr -d '=' | npx wrangler secret put SESSION_SECRET
openssl rand -base64 48 | tr '+/' '-_' | tr -d '=' | npx wrangler secret put DOCUMENT_URL_SECRET
```

The generated secrets go straight into Cloudflare and are never displayed.
Secrets attach to an existing Worker. On the very first rollout you can deploy
first (Step 4) and set the secrets right after, because the Worker fails closed:
without valid secrets it answers **503 "Portal is not configured"**, never
starts the container, and logs only the names of the missing settings.

Rotating `SESSION_SECRET` signs everyone out. Secret changes take effect at the
next container start.

## Step 4 — Deploy

### Preferred: Workers Builds (Cloudflare builds the Dockerfile; no Docker on the Mac)

In the Cloudflare dashboard, open **Workers & Pages → acg-portal → Settings → Builds**
and connect the GitHub repository. If a GitHub connection or build token
already exists, reuse it.

| Setting | Value |
|---|---|
| Production branch | the branch to deploy (e.g. `main` once PR #1 is merged) |
| Root directory | `acg-portal` (the Dockerfile and the Worker config must both be inside it) |
| Build command | `cd cloudflare && npm ci` |
| Deploy command | `cd cloudflare && npx wrangler deploy` |

The commands assume Workers Builds runs them as shell commands from the root
directory. Confirm on the first build log.

A push to the production branch builds the image from `acg-portal/Dockerfile`,
pushes it, deploys the Worker and rolls out the container. Non-production
branch builds only upload Worker versions and don't roll out containers.

### Fallback A: prebuilt image already in Cloudflare's registry

If an image was pushed by another machine with Docker
(`npx wrangler containers build .. -t acg-portal:<git-sha> --push`, run in
`cloudflare/`, prints the `registry.cloudflare.com/...` reference):

```bash
cd acg-portal/cloudflare
npm run deploy:prebuilt -- registry.cloudflare.com/<account-id>/acg-portal:<git-sha>
```

This deploys with that image reference, and the Mac needs no Docker. Add
`--dry-run` to check first.

### Fallback B: image archive pushed with `crane` (no Docker daemon)

On a linux/amd64 machine with Docker, from a clean checkout:

```bash
cd acg-portal
docker build --platform linux/amd64 -t acg-portal:<git-sha> .
docker save acg-portal:<git-sha> -o acg-portal-<git-sha>.tar
shasum -a 256 acg-portal-<git-sha>.tar > acg-portal-<git-sha>.tar.sha256
```

> Build it **from the repo Dockerfile unmodified**. An image built with a
> proxy or test CA injected (as in sandboxed environments) trusts that CA and
> must never be shipped.

On the Mac, after copying both files:

```bash
shasum -a 256 -c acg-portal-<git-sha>.tar.sha256
# Short-lived push credentials (15 min), straight into crane's login — never printed.
# The JSON field names are not documented: check them once with `| jq 'keys'`
# and adjust `.username` / `.password` below if they differ.
CREDS=$(npx wrangler containers registries credentials registry.cloudflare.com --push --expiration-minutes 15 --json)
printf '%s' "$CREDS" | jq -r '.password' \
  | crane auth login registry.cloudflare.com -u "$(printf '%s' "$CREDS" | jq -r '.username')" --password-stdin
unset CREDS
crane push acg-portal-<git-sha>.tar registry.cloudflare.com/<account-id>/acg-portal:<git-sha>
crane auth logout registry.cloudflare.com
cd acg-portal/cloudflare && npm run deploy:prebuilt -- registry.cloudflare.com/<account-id>/acg-portal:<git-sha>
```

(GHCR is not a supported Containers registry. The supported ones are
Cloudflare's registry, Docker Hub, Amazon ECR and Google Artifact Registry.)

## Step 5 — Verify

```bash
curl -sI https://portal.acgroupinc.com/login | grep -iE '^HTTP|strict-transport|content-security'   # 200 + both headers
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://portal.acgroupinc.com/api/auth/login \
  -H 'Origin: https://evil.example' -H 'Content-Type: application/json' --data '{}'               # 403
npx wrangler tail acg-portal        # in cloudflare/: shows "portal: starting container" on a cold start
```

Then sign in as the management user from Step 2, create the first real
investor, sign in as that investor (forced password change) and check the
schedule.

Zone settings from `CLOUDFLARE_DEPLOY.md` §4 still apply: Always Use HTTPS on,
minimum TLS 1.2, Email Address Obfuscation **off**, Rocket Loader **off**, no
Cache Everything, and a WAF rate-limit rule on `/api/auth/login`.

## Operations

- **Release:** merge → Workers Builds deploys. If the release adds migrations,
  run Step 1 *before* merging. During the rollout the single instance is
  replaced, so expect a short gap.
- **Backups:** these come from the database provider (point-in-time recovery),
  plus a periodic `pg_dump -Fc` with the migration role from a trusted machine.
  The container holds no state.
- **Logs:** `npx wrangler tail acg-portal` shows Worker logs; container output is
  in the dashboard (observability is enabled).
- **Idle cost vs cold starts:** raise `IDLE_TIMEOUT_MINUTES` in
  `cloudflare/wrangler.jsonc` (max 360) to keep the container warm longer.

## Developing and testing the Worker

```bash
cd acg-portal/cloudflare
npm ci
npm run typecheck      # wrangler types && tsc
npm test               # routing, header, lifecycle, config and logging tests
npm run build:dry      # bundle + config check (builds the image: needs Docker)
npx wrangler deploy --dry-run --outdir dist --containers-rollout none   # bundle only, no Docker
```

`wrangler dev` runs the Worker with the container locally, which needs Docker.
To test the real browser flow, serve it on **port 443** and map
`portal.acgroupinc.com` to `127.0.0.1`. On any other port, the browser's
`Origin` (`…:8787`) won't match the forwarded Host, and the app's CSRF check
rejects every POST. That is a dev-port artifact, not a bug.
