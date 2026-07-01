# Interactive UI prototype

`index.html` is a **single, self-contained, dependency-free** interactive
prototype of the ACG Investor Portal & Team Console. Open it directly in any
browser (double-click, or serve statically) — no build, no server, no network.

It exists so reviewers can click through the whole UI and flows before a staging
environment is stood up.

## How to use

Open `index.html`. Credentials are prefilled — pick **Investor** or
**Investor Relations** and click **Sign in**. You can switch between the two
sides from the sidebar footer.

You can exercise the flows: submit a request, send messages, toggle notification
preferences, search/filter the roster, open the investor detail slide-over,
**record a wire** (watch the investor flip to Active), approve/decline/queue
registrations, review and advance requests, and broadcast to investors.

## What this is — and isn't

- **Is:** the exact look, layout, copy, and interaction model of the app, driven
  by **in-browser demo data**.
- **Isn't:** the real system. Data is in-memory and **resets on refresh** — there
  is no backend, authentication, database, or persistence here.

The production application (Next.js + PostgreSQL + real session auth, server-side
authorization, audit log, and the full lifecycle) is the rest of `acg-portal/`.
Stand up a real, persistent environment with `../STAGING_DEPLOY.md`.
