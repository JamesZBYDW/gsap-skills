# Handoff: ACG Investor Portal & Team Console (CRM)

## Overview
A private, two-sided web application for **Amsterdam Capital Group (ACG)**, a yield-focused alternative-credit firm. Accredited investors hold a fixed-rate **ACG Promissory Note**; the portal is where they view their note and manage the relationship, and where ACG's Investor Relations (IR) team administers investors. Think **private-banking / wealth-portal CRM**: calm, trustworthy, precise.

Two sides, one app, gated by a shared sign-in:
- **Investor portal** — note dashboard, schedule, requests, messages, documents, profile.
- **Team console (IR/admin)** — portfolio overview, investor roster, pending registrations, requests queue, messages.

A product/content/compliance brief is included alongside this README: **`ACG_Portal_Design_Brief.md`** — read it; it defines product fields, lifecycle, voice, and **compliance copy rules** that must be honored.

## About the design files
The bundled **`ACG Investor Portal.dc.html`** is a **design reference / interactive prototype** (a "Design Component" that paints via a small runtime, `support.js`). It is **not production code to ship**. Recreate this design in the target stack using its established patterns — or, if there is no codebase yet, choose an appropriate stack (recommended **React + TypeScript + a real backend**) and implement it there.

To open the prototype locally: keep `support.js` and `assets/` next to the `.dc.html` and open the `.dc.html` in a browser (loads Manrope from Google Fonts). **All logic lives in the `<script type="text/x-dc">` block at the bottom of the file** — read it for exact data shapes, handlers, seed data, and flows.

> The prototype's "auth" is demo-only (no credential check; pick a role and sign in). Data is in-memory and resets on refresh. **Production requires a real backend, real authentication, a database, and security/compliance review** (securities offering handling PII — see Compliance).

## Fidelity
**High-fidelity.** Colors, typography, spacing, layout, and interactions are intentional — recreate faithfully. Exact tokens are in **Design Tokens**; exact copy is in the prototype.

---

## Tech notes
- **Font:** Manrope (400/500/600/700/800), Google Fonts. Numeric/reference values use `ui-monospace, Menlo, monospace`.
- **Icons:** inline stroke SVGs (1.7–2px, round caps), feather-style. Lucide matches closely: grid, calendar, inbox/tray, message-circle, file, user, users, user-plus, bell, search, plus, building, download, send, check, x, chevron-right, log-out.
- **Accent is themeable:** every interactive blue derives from one token `--acc` (default `#0071e3`).
- **Logo:** script wordmark "ACG". Cream tint (`assets/acg-logo-cream.png`) on navy surfaces; blue (`assets/acg-logo.png`) and gold also included. Prefer shipping SVG in production.

## Layout & shell
- **App frame:** full-viewport flex row, no page scroll. Backdrop navy `#0b1d3a`.
- **Sidebar:** fixed **248px**, navy `#0b1d3a`, right border `rgba(255,255,255,.06)`, padding `24px 16px 16px`. Top: logo (h 26px) + gold label (`INVESTOR PORTAL` / `TEAM CONSOLE`). Nav list. Footer pinned bottom: user chip + role-switch button (`Open team console` / `Back to investor view`).
- **Main:** `flex:1`, ivory `#faf7f0`, **top-left + bottom-left radius 14px**. Column: fixed top bar + scrollable region (`overflow:auto`).
- **Top bar:** padding `20px 34px 18px`, bottom border `rgba(12,31,61,.07)`. Left: gold eyebrow (section) + `h2` title. Right: status pill (investor: green "Note active"; team: date), **Sign out** text button, bell icon with gold unread dot.
- **Content padding:** `26px 34px 36px`.
- **Nav item:** flex, gap 11px, padding `9px 11px`, radius 9px, `.84rem`. Inactive `#9fabc4`/500; hover `bg rgba(255,255,255,.07);#fff`. Active `#fff; bg rgba(255,255,255,.08)`/600. Optional right count badge (gold `#c8a878` or accent), `.64rem`, pill.

---

## Screens / Views

### 0. Auth gate (unauthenticated)
Centered card (**424px**) on navy radial backdrop `radial-gradient(1100px 600px at 50% -8%, rgba(0,113,227,.18), transparent), #0b1d3a`. Logo + `AMSTERDAM CAPITAL GROUP` (gold, letter-spaced) above a translucent card (`bg rgba(255,255,255,.04); border rgba(255,255,255,.1); radius 20px; padding 30px`). Two sub-screens:
- **Sign in** (default): title + sub "Private investor portal & team console". **Segmented role toggle** (`Investor` | `Investor Relations`) — selected = white pill on `rgba(255,255,255,.06)` track. EMAIL + PASSWORD (dark translucent fields, prefilled in demo), full-width accent **Sign in**. Footer: "Accredited investors only · **Request access ›**". Routes to chosen side.
- **Request access** (register): LEGAL NAME, EMAIL, ACCOUNT TYPE (segmented Individual | Entity), INTENDED PRINCIPAL + TERM side-by-side, required **accredited-investor acknowledgment** checkbox. **Submit** creates a Pending registration in the team Registrations queue (rate auto-derived from term), returns to Sign in with a toast.

### A. Investor — Overview (signature)
Bento grid, 4 cols, gap 16px. White tiles (`border rgba(12,31,61,.08); radius 16px; padding 18–24px`; gold eyebrow `#a87e45` `.62rem`/700/`.14em`; value `1.55rem`/800):
- **Next distribution** (span 2, navy gradient, cream): `$3,750` (2.7rem), "Arrives tomorrow · Jul 1, 2026", gold radial glow.
- **Maturity ring** (span 2): SVG donut (track `rgba(12,31,61,.09)`, progress gold `#a87e45`, 58% `stroke-dasharray="182 314"`, −90°), center "58% / of term"; beside: "April 14, 2027", "10 months remaining", green "14 of 24 distributions paid".
- **Principal** `$250,000` · **Fixed rate** `18.0%` · **Status** `Active` (green) · **Monthly income** `$3,750`.
- **Distributed to date** (span 2): `$52,500`, "14 of 24", 24-bar sparkline (paid gold gradient, next accent, upcoming `rgba(12,31,61,.12)`).
- **Quick actions** (span 2): 2×2 (Add capital, Update banking, Request document, Message IR) — first three open request composer preset; last → Messages. Button `bg #f4f1ea; border rgba(12,31,61,.07); radius 11px`; hover `bg #fff; border var(--acc); color var(--acc)`.

### B. Investor — Schedule
Three KPI cards (Distributed $52,500 · Next Jul 1 2026 · Remaining $37,500). **Term timeline**: 24 bars (paid gold, next accent, upcoming faint @62%) + legend. **Ledger table** (# · Date · Amount · Status · Reference): status dot + pill + mono ref `ACH·2407` (upcoming "—").

### C. Investor — Requests
- **Start a request** card + helper "We'll confirm anything sensitive with you by phone before it takes effect." 6 chips: **Add capital** (accent-filled), Update banking, Maturity election, Request a document, Update profile, Notification preferences (outlined) — each opens compose modal preset.
- **Request list** (newest first): card w/ gold-tinted type icon, uppercase gold type, bold title, status pill, date. Click **expands** (accordion): detail text, optional amber note, **history timeline** (done = green dot + ink; pending = hollow dot + gray).

### D. Investor — Messages
IR concierge thread. Hint "Investor Relations · typically replies within a day". Bubbles: investor = accent bg, white, right (bottom-right corner squared); IR = white card, left (bottom-left squared); author + text + time. Sticky composer: white rounded input + accent send. Enter sends; auto-scroll to newest.

### E. Investor — Documents
Table (Document · Type · Date · Download): file icon in gold square, name, gold kind pill (Statement / Summary / Tax / Agreement), date, download icon. Download streams the real PDF in production.

### F. Investor — Profile
Cards: **Account** (legal name, type, email, phone) · **Accreditation** (green check, "Acknowledged · confirmed Apr 10, 2025") · **Banking on file** (masked `Chase ••••6042`, "Update ›" opens banking request; note "Changes to banking are confirmed by phone before they take effect") · **Tax & notifications** (W-9; three toggle switches — Distribution posted, Maturity reminders, New message alerts — green when on).

### G. Team — Overview (signature)
Four KPI tiles: **Total capital** `$48.2M` (navy gradient) / "across 142 active notes"; **Active notes** 142 / "+6 this month"; **Distributed to date** `$6.71M` / "$612K this month"; **Maturing ≤ 90 days** `9` (amber) / "$5.4M principal". Then two columns: left **Approaching maturities** table (Investor · Principal · Rate · Matures + in-N-days, amber if urgent); right stack of three **action cards** (Pending registrations, Open requests, Investor replies) with live counts → navigate.

### H. Team — Investors
Toolbar: search + state filter pills (All · Active · Awaiting · Pending) + accent **Add investor** (opens create modal → new investor in Awaiting). Roster **table** (Investor · Type · State · Principal · Rate · Term · chevron). State pill: Active=green, Awaiting=accent, Pending=amber, Declined=gray. Row click → **detail slide-over** (right, 444px): investor facts + ACTIONS card (mark funded / send message / request document, contextual to state).

### I. Team — Registrations
Queue of inbound **Request-access** submissions (newest first), each a card: name, type, email, intended principal, term, derived rate, submitted date, **Approve** (→ creates investor in Awaiting) / **Decline** actions. This is where the public site's "Request access" form lands.

### J. Team — Requests
All investor requests across the book. Filter pills by status (All · New · In review · Done). Each row: investor name, request type, title, status pill, date; click expands to detail + history; team can advance status (New → In review → Done) which the investor sees reflected in their Requests view.

### K. Team — Messages
Two-pane: left list of investor threads (avatar, name, last-message snippet, unread gold dot); right the selected conversation (same bubble system as investor Messages, roles inverted — IR replies are the accent bubbles). Composer at bottom.

---

## Design tokens
```
/* Brand */
--navy-deep:    #0b1d3a;   /* sidebar, auth backdrop, dark cards */
--navy-ink:     #0c1f3d;   /* headings on light */
--ivory:        #faf7f0;   /* main canvas */
--cream:        #f4f1ea;   /* quiet fills, quick-action buttons */
--card:         #ffffff;
--gold:         #a87e45;   /* eyebrows, note/maturity accents */
--gold-soft:    #c8a878;   /* badges, labels on navy */
--acc:          #0071e3;   /* PRIMARY ACTION — themeable */
--acc-hover:    #0077ed;

/* Status */
--ok:    #1f8a5b;  /* active / paid / positive */
--warn:  #b9791f;  /* amber — maturing, phone-confirm notes */
--info:  #0071e3;  /* awaiting / next / in-review */
--mute:  #6c7a93;  /* declined / disabled / upcoming */

/* Lines & text */
--line-light: rgba(12,31,61,.08);
--line-dark:  rgba(255,255,255,.10);
--text-2:     #5b6473;   /* secondary on light */
--text-3-dark:#9fabc4;   /* secondary on navy */

/* Radii */  card 16px · field/button 10–11px · nav 9px · main-panel corner 14px · auth card 20px
/* Type */   page title h2 ~1.5rem/800 · tile value 1.55rem/800 · big stat 2.7rem · eyebrow .62rem/700/.14em uppercase · body .84–.92rem · helper .78rem
/* Shadow */ tiles flat with 1px border; slide-over & modals use a soft -large shadow (e.g. 0 24px 60px rgba(11,29,58,.18))
```

---

## Suggested data model (from the prototype's seed shapes)
- **User**: id, role (`investor` | `team`), name, email, passwordHash, phone.
- **Investor**: id, legalName, type (`Individual` | `Entity`), email, phone, state (`active` | `awaiting` | `pending` | `declined`), principal, rate, termMonths, fundedDate, maturityDate, banking { bankName, last4, method }, accreditation { acknowledged, confirmedDate }, w9OnFile, notifPrefs { distributionPosted, maturityReminder, newMessage }.
- **Note / Schedule**: investorId, principal, rate, termMonths, monthlyAmount; distributions[] { index, date, amount, status (`paid` | `next` | `upcoming`), reference }.
- **Registration** (request-access): id, name, type, email, intendedPrincipal, term, derivedRate, date, status (`pending` | `approved` | `declined`).
- **Request**: id, investorId, type (`add-capital` | `update-banking` | `maturity-election` | `document` | `update-profile` | `notif-prefs`), title, detail, status (`new` | `in-review` | `done`), date, note?, history[] { label, done }.
- **Message**: id, threadId(investorId), author (`investor` | `ir`), text, time, read.
- **Document**: id, investorId, name, kind (`Statement` | `Summary` | `Tax` | `Agreement`), date, fileUrl.

**Term → rate table** (used by register + create): 12mo→12% · 18mo→15% · 24mo→18% · 36mo→20%. Confirm these are the firm's real terms before launch.

## Key flows to preserve
1. **Role-gated auth** → investor lands on Overview, team lands on Team Overview. Role-switch button in sidebar footer moves between sides (production: gate by real permissions, not a button).
2. **Request-access → Registrations queue → Approve → Investor (Awaiting) → mark funded → Active.** End-to-end lifecycle.
3. **Investor request → Team Requests queue → status advances → investor sees update.** Two-way.
4. **Messaging** is bidirectional per investor thread; unread dots both sides.
5. **Sensitive changes (banking) show a "confirmed by phone" note** and should require out-of-band verification server-side.

---

## Compliance & security (read `ACG_Portal_Design_Brief.md`)
This is a **securities offering handling PII** — treat as regulated:
- **Real auth**: hashed passwords (argon2/bcrypt), sessions or JWT, 2FA, password reset, rate-limiting, lockout. No client-side role trust.
- **Authorization**: investors see only their own note/requests/messages/docs; team scoped by permission. Enforce server-side on every endpoint.
- **Data**: encrypt PII at rest + in transit; audit log for state changes, banking edits, approvals; backups.
- **Banking changes**: server-enforced out-of-band (phone) confirmation before effect — the UI note must be backed by real process.
- **Accreditation**: persist the acknowledgment + timestamp; the offering copy/terms must be reviewed by counsel. **Do not present rates/terms as guaranteed without legal sign-off** — keep disclaimers from the brief.
- **Documents**: access-controlled, signed/expiring URLs; never public.

## Build steps for Claude Code
1. **Stand up the stack**: React + TypeScript front end; backend (Node/Express, Next.js API, or similar) + database (Postgres); auth provider or hand-rolled per above.
2. **Schema** from the data model; seed with the prototype's sample investor (Margaret Vance, $250k, 18%, 24mo, funded Apr 2025, 14/24 paid) for parity testing.
3. **Recreate the shell** (sidebar + main + top bar) and tokens as a theme; wire `--acc` as the single accent token.
4. **Build the views** A–K to match the prototype 1:1 (use it as the visual source of truth; copy text verbatim).
5. **Wire the flows** above through real APIs; replace in-memory state with server data + optimistic UI.
6. **Layer compliance/security**; add tests; then deploy to the firm's domain over HTTPS (Vercel/AWS/etc.) with secrets in env, DB backups, and monitoring.

## Asset manifest
- `ACG Investor Portal.dc.html` — interactive prototype (visual + behavioral source of truth).
- `support.js` — runtime for the prototype (open it locally; not for production).
- `assets/acg-logo-cream.png` · `acg-logo.png` · `acg-logo-gold.png` — wordmark tints.
- `ACG_Portal_Design_Brief.md` — product, content, voice & compliance brief. **Required reading.**
- `README.md` — this file.
