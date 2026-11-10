# Alternative: portal.acgroupinc.com on your own Docker server + Cloudflare Tunnel

> **Production uses Cloudflare Containers**: see `CLOUDFLARE_CONTAINERS_DEPLOY.md`.
> This runbook is the alternative, for running the stack on a server you
> control. Its zone settings (§4) apply to both.

This runbook It can be followed by an engineer or handed to a
coding agent (Codex, Claude Code) that has shell access to the server — the
agent-facing rules are in `AGENTS.md`.

## The shape of it

```
investor ──HTTPS──▶ Cloudflare (DNS, TLS, WAF) ══ tunnel ══▶ cloudflared ──▶ app:3000 ──▶ Postgres
                    portal.acgroupinc.com                    └────────── one Docker host ─────────┘
```

The portal is a Node.js server (Next.js) with PostgreSQL. It runs unmodified on
one Docker host; a **Cloudflare Tunnel** connects that host outbound to
Cloudflare, which serves it on your domain over HTTPS. The host publishes **no
ports** — there is no public IP to firewall and no certificate to renew.

**Why not Cloudflare Workers/Pages directly?** The app hashes passwords with a
native Argon2 module and talks to Postgres over TCP through Prisma; neither runs
on the Workers runtime as-is. Porting is possible (Web Crypto hashing +
Hyperdrive) but it is a rewrite of the auth and data layers, and buys nothing
for a portal of this size. Cloudflare in front of a Node host is the supported
path.

## What a human must provide

A coding agent cannot create these and should stop and ask rather than guess:

| Needed | Who has it |
|---|---|
| Access to the Cloudflare account that holds the `acgroupinc.com` zone (it is already on Cloudflare nameservers; `portal` is unused) | Whoever manages ACG's DNS |
| A Linux server with Docker Engine + the Compose plugin, 2 GB RAM or more, outbound internet | ACG / engineer |
| Name + email for the first management login | ACG |

## 1. Create the tunnel (Cloudflare dashboard, ~3 min)

Menu names move around; at the time of writing:

1. Cloudflare dashboard → **Networking → Tunnels → Create a tunnel**. Name it
   `acg-portal`.
2. On the install step, pick **Docker** (any option works). The command shown
   contains `--token eyJ…` — copy only that token. Don't run the command;
   Compose runs the connector for you.
3. Open the tunnel → **Routes → Add route → Published application**:
   - **Subdomain:** `portal` — **Domain:** `acgroupinc.com`
   - **Service URL:** `http://app:3000`
4. Save. Cloudflare creates the `portal.acgroupinc.com` DNS record automatically.

## 2. Bring up the stack (on the server)

```bash
git clone https://github.com/JamesZBYDW/gsap-skills.git
cd gsap-skills/acg-portal
git checkout claude/prototype-to-production-nghtin   # or main once PR #1 is merged

cp .env.production.example .env.production
chmod 600 .env.production
```

Fill in `.env.production`:

| Var | Value |
|---|---|
| `APP_URL` | `https://portal.acgroupinc.com` (already set in the template) |
| `SESSION_SECRET` | `openssl rand -base64 48 \| tr '+/' '-_' \| tr -d '='` |
| `DOCUMENT_URL_SECRET` | same command, a different value |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `TUNNEL_TOKEN` | the token from step 1 |

Then:

```bash
docker compose -f docker-compose.cloudflare.yml --env-file .env.production up -d --build
docker compose -f docker-compose.cloudflare.yml --env-file .env.production ps
```

All three services should be `running`, with `db` and `app` `healthy`. The app
container applies database migrations on every start. The tunnel shows
**Healthy** in the Cloudflare dashboard within a minute.

> Tip: `alias dc='docker compose -f docker-compose.cloudflare.yml --env-file .env.production'`
> — the commands below use `dc`.

## 3. Create the first management login

**Do not run the seed in production** — it wipes the database and loads demo
investors. Create the real Team Console login instead:

```bash
dc exec \
  -e ADMIN_EMAIL='<name>@acgroupinc.com' \
  -e ADMIN_NAME='Full Name' \
  -e ADMIN_PASSWORD='<12+ chars, letters and numbers>' \
  app node prisma/create-admin.mjs
```

Re-run it with the same email to reset that password (it also signs that user
out everywhere and clears a lockout). Repeat with other emails for additional
team members. Every investor account is then created from **Team Console →
Create account**.

## 4. Cloudflare settings for this zone

| Setting | Value | Why |
|---|---|---|
| SSL/TLS → Edge Certificates → **Always Use HTTPS** | On | No plain-HTTP entry point. |
| SSL/TLS → **Minimum TLS Version** | 1.2 | Financial PII. |
| Scrape Shield → **Email Address Obfuscation** | **Off** | It rewrites email addresses in the HTML, which breaks the pages that show them (investor roster, profile). |
| Speed → **Rocket Loader** | Off | Rewrites script tags; conflicts with the app's strict Content-Security-Policy. |
| Caching | Leave default. **No "Cache Everything" rule** on this hostname | Pages are per-investor and must never be cached at the edge. |
| Security → WAF → Rate limiting rule | Path equals `/api/auth/login`, e.g. 10 requests / minute / IP → block | Edge backstop for the app's own login throttle. |

The app already sends HSTS, CSP, and frame-denial headers itself; don't add
Transform Rules that override them.

## 5. Verify

```bash
curl -sI https://portal.acgroupinc.com/login | grep -iE '^HTTP|strict-transport|content-security'
```

Expect `HTTP/2 200` and both headers. Then in a browser:

1. Sign in on the **Investor Relations** tab with the login from step 3 → lands
   on *Portfolio overview* (empty).
2. **Create account** → fill in an investor with note terms and a wire date →
   the investor appears in **Investors** as Active.
3. Sign out, sign in on the **Investor** tab with the issued password → forced
   to set a new password → overview shows the principal and the distribution
   schedule.

The console has no "delete investor" action, so run steps 2–3 with the real
first investor, or do the full walkthrough on a staging copy (see below).

## Operations

**Deploy an update**

```bash
git pull
dc up -d --build        # migrations apply on start; ~1 min of downtime
```

**Back up the database** (run daily from cron; copy the file off the server)

```bash
dc exec -T db pg_dump -U acg -Fc acg_portal > "acg_portal_$(date +%F).dump"
```

**Restore**

```bash
dc exec -T db pg_restore -U acg -d acg_portal --clean --if-exists < acg_portal_YYYY-MM-DD.dump
```

**Logs**

```bash
dc logs -f app           # application
dc logs -f cloudflared   # tunnel
```

**Rotate a secret** — edit `.env.production`, then `dc up -d`. Rotating
`SESSION_SECRET` signs everyone out. To rotate the tunnel token, refresh it on
the tunnel's page in the dashboard, update `TUNNEL_TOKEN`, and `dc up -d`.

**Managed Postgres instead of the bundled one** — set `DATABASE_URL` in
`.env.production` (with `?sslmode=require`) and start only the other two
services: `dc up -d --build --no-deps app cloudflared`.

## Things to know

- **One app container.** The login rate limiter is in-memory, so don't scale
  `app` past one replica without moving it to Redis (`src/lib/ratelimit.ts`).
- **Client IPs** come from Cloudflare's `CF-Connecting-IP` header
  (`src/lib/http.ts`). That is trustworthy only because nothing but the tunnel
  can reach the app — keep it that way; don't add a `ports:` mapping.
- **The host is the security boundary for the data.** Keep it patched, restrict
  SSH to keys, and encrypt the disk — the Postgres volume holds investor PII and
  banking last-4.
- **Staging first.** The same steps with a second tunnel and hostname
  (`portal-staging.acgroupinc.com`) give a staging copy; that one may be seeded
  (`STAGING_DEPLOY.md`).
- The compliance and pre-launch checklist in `DEPLOY.md` still applies
  (counsel review, 2FA for team accounts, email delivery, monitoring).
