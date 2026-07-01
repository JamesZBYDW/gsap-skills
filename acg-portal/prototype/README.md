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

You can exercise the flows:

- **Investor:** view the note overview, distribution schedule, documents, and
  the concierge **chat** with Investor Relations; update notification toggles;
  change your password.
- **Management:** portfolio overview, investor roster, and per-investor detail
  where you **set the note terms** (principal, fixed rate, status, first
  distribution date, recurring day, amount, maturity) and **provision the
  investor's login** (email + password); approve/decline pending registrations;
  chat with any investor; broadcast to all.

## What this is — and isn't

- **Is:** the exact look, layout, copy, and interaction model of the app, driven
  by **in-browser demo data**.
- **Isn't:** the real system. Data is in-memory and **resets on refresh** — there
  is no backend, authentication, database, or persistence here. (For example, in
  the prototype "Save note" and "Create login" show the intent with a toast; in
  the live app they persist to the database and the investor's schedule is
  generated from the entered terms.)

The production application (Next.js + PostgreSQL + real session auth, server-side
authorization, audit log, and the full lifecycle) is the rest of `acg-portal/`.
Stand up a real, persistent environment with `../STAGING_DEPLOY.md`.
