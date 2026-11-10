# ACG Investor Portal — Design Brief

*A context document for designing the portal from scratch. This is information and requirements only — not an existing layout to copy.*

---

## 1. What it is

A private, two-sided web portal for **Amsterdam Capital Group (ACG)**, a yield-focused alternative-credit firm. Accredited investors hold a fixed-rate **ACG Promissory Note**; the portal is where they view their note and manage their relationship, and where ACG's Investor Relations team administers investors. Think private-banking / wealth-portal feel: calm, trustworthy, precise, understated.

**Company snapshot (for tone/context):** alternative-credit platform, HQ New York. Returns come from disciplined investing in short-duration small-business receivables held on the firm's balance sheet. Investors receive monthly distributions. Accredited investors only.

---

## 2. Audiences

1. **Accredited investors** — high-net-worth individuals and entities/family offices. They want clarity, confidence, and a sense of stewardship: "where does my money stand, when do I get paid, what can I do."
2. **ACG Investor Relations / management team** — internal staff who onboard investors, record wires, review requests, and message investors.
3. **Prospective investors at the front door** — sign in, or create an account / register interest.

Note: ACG serves both **U.S. and Chinese** investors, so the design should accommodate a future bilingual (English / Simplified Chinese) treatment — clean typographic hierarchy that works in both scripts, room for longer/shorter strings.

---

## 3. The product being represented (the "note")

Each investor holds one note with these attributes (these are the fields the UI surfaces):

- **Principal** (e.g. $250,000) — minimum investment **$100,000**
- **Fixed rate** (annual %)
- **Term** (in months)
- **Monthly distribution** (derived)
- **Wire date** (when funds were received — note "activates" from here)
- **First distribution date**, **maturity date**, **distribution day of month**
- **Status** (see lifecycle below)

### Rate structure (fixed for the term)

| Term | Fixed annual rate |
|---|---|
| 1 year | 12% |
| 1.5 years | 15% |
| 2 years | 18% |
| 3 years | 20% |

---

## 4. Surfaces & screen inventory

### A. Public gate
- **Sign in** (investor) and a separate **team/console sign-in**.
- **Create an account / register** — collects legal name, entity vs. individual, email, password, intended principal, term & rate, banking, and an **accredited-investor acknowledgment**.

### B. Investor portal (signed in)
- **Note overview / dashboard** — the hero. Principal, fixed rate, term, monthly distribution, next distribution date, maturity countdown, current status. The emotional center: "your capital is working, here's the rhythm."
- **Schedule & ledger** — a calendar/timeline of distributions and a running ledger of past/upcoming payments.
- **Requests** — investor-initiated actions, each with a status and a history trail:
  - Update banking (ACH details)
  - Maturity election (renew onto a new term, or redeem)
  - Add capital
  - Request a document (e.g. statements, tax letter)
  - Update profile
  - Notification preferences
- **Messages** — a direct thread with Investor Relations.
- **Profile / account** — name, entity type, email, tax form type, banking on file (masked).
- **Notifications** — distribution posted, maturity approaching, request updates, new messages.

### C. Management console (team)
- **Overview** — portfolio totals: total capital, active notes, total distributed, notes maturing soon; a list of approaching maturities.
- **Investors table** — the full roster with state, principal, rate, term.
- **Pending registrations** — a review queue to approve or decline new sign-ups.
- **Investor detail / edit** — adjust terms and banking; **record the wire** (which activates the note and generates its schedule).
- **Notes table** and **Maturities table** — administrative views.
- **Requests queue** — review investor requests; approve / complete / decline / ask for more info.
- **Messages** — roster of threads, per-investor conversation, and a **broadcast** to multiple investors.
- **Notifications** — new registrations, new requests, investor replies.

---

## 5. Core flows

**Onboarding / lifecycle states** — the spine of the product:
1. **Pending** — investor self-registered; awaiting team review.
2. **Awaiting** — approved (or created by the team); account exists but no money received yet, so no schedule.
3. **Active** — ACG has recorded the wire; the note's schedule (first distribution, maturity) now counts from the wire date.
4. **Declined** — registration not accepted.

Design should make an investor's state legible at a glance (a pending or awaiting investor sees a "what happens next" state, not an empty dashboard).

**Requests workflow** — investor submits → team reviews → status updates flow back to the investor with a visible history (submitted → reviewed → approved/needs-info, etc.). Some actions (like banking) are explicitly "confirmed by phone before taking effect."

**Messaging** — lightweight, human, IR-to-investor. Should feel like a concierge line, not a ticketing system.

---

## 6. Key objects & fields (for cards, tables, detail panels)

- **Investor**: name, individual/entity, email, state, accreditation status.
- **Note**: principal, rate, term, wire date, first distribution, maturity, distribution day.
- **Request**: type, title, detail, status (Pending review / Approved / Completed / Declined / Needs info), timestamped history.
- **Message**: sender (investor or team), author name, text, timestamp.
- **Notification**: short headline + subline, icon, read/unread, relative time.

---

## 7. Voice & tone

- Institutional, reassuring, quietly premium. Private-wealth, not fintech-flashy.
- Plain and precise about money; no hype.
- Returns are **"fixed for the term"** — and described as **not guaranteed**.
- Microcopy should feel like a discreet relationship manager: confident, warm, exact.

---

## 8. Brand direction (identity to honor)

Use these as the established identity — adapt the visual system freely, but keep the feel.

- **Palette:** deep navy (primary, `#0C1F3D`), gold accents (`#B8925A` / `#C8A878`), warm cream/ivory backgrounds (`#F8F4EC` / `#F4EFE4`). A small set of status colors (e.g. a muted green for "active/paid," an amber/rust for "attention/maturing").
- **Type:** an elegant serif for display/headlines (e.g. Instrument Serif feel) paired with a clean, legible sans for UI and data (e.g. Inter). Strong typographic hierarchy; numbers should read clearly.
- **Feel:** generous whitespace, restrained ornamentation, fine rules and subtle gold detailing, a script-style brand mark. Calm density — rich information presented without clutter. Trust through clarity.

---

## 9. Compliance rules that shape copy & labels (important for the designer)

These affect what words and labels can appear on screen:

- The product is always called the **"ACG Promissory Note."** Never label it "asset-backed secured," "secured note," or similar — that wording isn't supported by the legal structure.
- **No guaranteed-return language** anywhere. Use "fixed for the term, not guaranteed."
- **Accredited investors only** — registration must include an accredited-investor acknowledgment.
- Banking changes are **confirmed by phone**; wire instructions are shared by **secure email**. The portal **records** subscriptions and activates a note when the firm's bank confirms the wire — it does **not** move money. Copy should reflect that (e.g. "we'll confirm by phone," "your note activates once we record your wire").

---

## 10. Out of scope / notes for the designer

- This brief is product + content + brand information. It intentionally omits any existing screen layout or code — design the screens fresh.
- Prioritize the **investor note-overview dashboard** and the **team console overview** as the two signature screens; the rest are supporting views.
- Assume responsive (used on desktop and phone). The investor side skews toward at-a-glance reassurance; the team side skews toward dense tables and quick actions.
