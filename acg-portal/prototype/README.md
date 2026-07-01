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

- **Investor:** view the note overview, distribution schedule, and documents;
  update notification toggles; change your password. (There is no self-registration
  and no in-app messaging — investors sign in with credentials management issues.)
- **Management:** portfolio overview, investor roster, and a **Create account** tab
  where you enter an investor's details, **note terms** (principal, fixed rate,
  status, first distribution date, recurring day, amount, maturity), and **login
  credentials** (email + password) in one step. From an investor's detail panel you
  can also update their note terms and reset their login later.

## What this is — and isn't

- **Is:** the exact look, layout, copy, and interaction model of the app, driven
  by **in-browser demo data**.
- **Isn't:** the real system. Data is in-memory and **resets on refresh** — there
  is no backend, authentication, database, or persistence here. (For example, in
  the prototype "Create account" and "Save note" show the intent with a toast; in
  the live app they persist to the database, the investor's schedule is generated
  from the entered terms, and the investor is forced to set their own password on
  first sign-in.)

The production application (Next.js + PostgreSQL + real session auth, server-side
authorization, audit log, and the full lifecycle) is the rest of `acg-portal/`.
Stand up a real, persistent environment with `../STAGING_DEPLOY.md`.
