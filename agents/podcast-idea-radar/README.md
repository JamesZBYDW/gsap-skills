# Podcast Idea Radar

An agent that continuously scans the internet for conversations worth making
episodes about, scores them for **podcast potential**, and tells you what to
record.

It answers one question on a schedule: *what should we talk about today?*

> **Note:** this agent is unrelated to the GSAP skills in `skills/`. It lives in
> `agents/` on purpose — the `skills/` directory is scanned by the skills CLI and
> is reserved for GSAP animation skills, so a podcast agent there would show up
> in GSAP installs. Nothing here is loaded by `npx skills add`.

---

## Operating reality — read this first

What this environment actually permits, established by probing rather than
assumption:

| Capability in a scheduled (Routine-fired) container | Result |
|---|---|
| WebSearch / WebFetch | ✅ works |
| `git clone` the repo | ✅ works (public read) |
| `git push` to the repo | ❌ **403 — repo not in the container's authorized set** |
| Repo present at start | ❌ empty container; `create_trigger` takes no source parameter |
| MCP connectors (Gmail etc.) | ❌ unavailable to this org's Routines |
| `PushNotification` tool | ❌ absent; the run's final message becomes the notification |

**The push denial is the load-bearing one.** The ledger design below depends on
committing state between runs, and a scheduled run cannot commit. So the radar
currently ships in a reduced configuration:

- **Daily report — ACTIVE and self-contained.** Scans the previous 24 hours from
  scratch each morning and delivers the report as its final message, which
  becomes the email. No repo, no ledger, no git. This is what actually runs.
- **Hourly pulse — DISABLED.** Without a writable store it cannot accumulate
  anything between runs, so it would perform 24 redundant scans a day and, having
  no memory of what it already found, re-notify about the same topics. Disabled
  deliberately rather than left burning tokens for no benefit.

**To re-enable the full design**, the repo needs push access from scheduled
containers — add `JamesZBYDW/gsap-skills` to the environment's authorized
repositories (or supply git credentials with push rights) at
claude.ai/code → Environments. Then re-enable
`trig_019oC9H5eJJ2po1u6h32UQ3E` and the ledger, hourly accumulation, computed
trend stages and threshold pushes all come back — the machinery is already
written and verified working interactively.

Everything below describes the full design. It is accurate, and it is what runs
the moment push access exists.

## How it runs

Two cadences over one shared memory:

**Hourly — `PULSE`.** A delta scan. Reads the topic ledger, scans three source
lanes (rotating, so everything gets covered across the day), and reports only
what *changed*: new topics, score movements, trend-stage promotions, kills. A
quiet hour says "no material change" in three lines. This is deliberate — a full
report every hour would hand you the same fifteen ideas twenty-four times.

**Daily — `REPORT`, 05:15 ET.** The full ranked slate: 10–15 ideas with the story,
why now, the bigger question, discussion angles, opposing views, trend stage,
score, and a research trail. Plus *Internet Conversations Worth Watching*,
*China vs. US* where a real contrast exists, and **TOP 3 I WOULD RECORD** with
opening hooks. Emailed, and committed to `state/reports/`.

The daily report is a roll-up of what the pulses accumulated, which is why the
hourly runs are cheap and the daily one is worth reading.

It fires at 05:15 ET rather than 06:00 because "by 6am" is a deadline — the run
needs room to finish first.

## What you get notified about

Push notifications are **threshold-gated**, not per-run. You'll get roughly 2–5
a day instead of 24:

| Trigger | Condition |
|---------|-----------|
| New high scorer | First appearance at **≥ 8.0** |
| Breakout | Score rose **≥ +1.5 in 24h** and now **≥ 7.5** |
| Stage promotion | **Emerging → Rising** at **≥ 7.5** — the early-catch payoff |
| Daily digest | Once per day, when the report lands |
| Retraction | A pushed topic turned out to be false — bypasses the cap |

Capped at **4 threshold pushes/day** (digest and retractions exempt). Everything
below the bar lands silently in the commit, where you can read it whenever.

On the scheduled path the push is the Routine's completion notification, built
from the run's final message — so the agent ends a gated run with just the
one-line headline and ends a quiet run with a single quiet marker. All the detail
goes into the committed pulse note instead. See `AGENT.md` § Delivery channel.

## Email

The daily report arrives by email at the account's registered address, built from
the run's final message — digest line first (that's the push), then TOP 3, then
the full slate.

Two limits worth knowing, both environmental rather than design choices:

- **Routine notifications have no configurable recipient.** They go to the account
  address. Delivering to `jameszhangby@outlook.com` automatically needs a one-time
  forwarding rule set up on the receiving side.
- **Scheduled runs have no Gmail connector** (unavailable to this org's Routines),
  and the Gmail connector has **no send tool** even where it is available — only
  `create_draft`. So an interactively-run report can leave a ready-to-send draft
  addressed anywhere, but no automated path composes and sends mail directly.

The committed `state/reports/YYYY-MM-DD.md` is the durable copy regardless of what
any notification channel does.

## The ledger is the point

`state/ledger.jsonl` is what makes an hourly cadence produce signal instead of
repetition. One line per topic, carrying score history, stage history, and every
source lane that has independently picked it up.

Three things fall out of it:

- **No repeats.** Topics are identified by their *underlying question*, not their
  headline — so three stories about three different AI companion apps collapse
  into one episode idea instead of cluttering three slots.
- **Only new topics get recorded.** A repeat appends a signal to the line that
  already exists rather than adding a new one, and anything scoring under 5.5
  with flat momentum gets no record at all. The file grows only with genuinely
  new material; existing lines change in place.
- **Real trend stages.** Emerging / Rising / Mainstream / Peaking / Saturated are
  *computed* from how signal counts moved over time, not guessed. That's the only
  way "Emerging" carries information.
- **Memory.** Killed topics stay killed. Recorded episodes never resurface.

Because the agent runs in an ephemeral container, **every run commits the ledger**
— that's the persistence mechanism, so `git log state/ledger.jsonl` doubles as
the trend archive showing when each topic was caught and how it moved.

---

## Running it

### Scheduled (how it's set up)

An hourly Routine fires a fresh session that reads `AGENT.md`, runs the
appropriate mode, commits state, and pushes only if the gate opens. Manage it
with the Routine tools:

- `list_triggers` — see the schedule and next run
- `update_trigger` — change cadence or the prompt
- `fire_trigger` — run one now, off-schedule
- `delete_trigger` — stop it

### Manually

```
Read agents/podcast-idea-radar/AGENT.md and run a PULSE.
```

```
Read agents/podcast-idea-radar/AGENT.md and run a full REPORT.
```

Or via the subagent: `.claude/agents/podcast-idea-radar.md`.

---

## Tuning

Most of what you'll want to adjust is one edit:

| Want | Change |
|------|--------|
| Fewer / more pushes | Thresholds in `AGENT.md` § Notification gate |
| Different ranking behavior | Weights and modifiers in `references/scoring.md` |
| Different sources or subs | Lane definitions in `references/sources.md` |
| Different report shape | `references/templates.md` |
| Report at a different hour | The `06:00` check in `AGENT.md` § Operating model |

The scoring weights are the highest-leverage knob. Curiosity is weighted highest
(0.25) and Timeliness lowest (0.15) on purpose: an episode that's merely current
ages out, and one that makes someone genuinely want to know doesn't.

## Files

| Path | What it is |
|------|-----------|
| `AGENT.md` | Role, cadence, run protocols, notification gate — start here |
| `references/scoring.md` | Weighted rubric, anchors, modifiers, kill rules, worked example |
| `references/sources.md` | Lane definitions, rotation table, query patterns |
| `references/proof.md` | **Trend proof standard** — source tiers T1–T5, required fields, score caps |
| `references/ledger.md` | State schema, dedup identity rule, stage computation |
| `references/templates.md` | PULSE note, REPORT, push copy, retraction |
| `state/ledger.jsonl` | Topic memory (starts empty) |
| `state/ledger.example.jsonl` | Three annotated records: active, rising, killed |
| `state/reports/` | Archived daily reports |

## Design notes

Three judgment calls worth knowing about, since they're the ones most likely to
need revisiting:

**Hourly ≠ hourly reports.** The original brief was daily. Making it hourly
without splitting pulse from report would have meant 24 near-identical reports a
day. The split keeps the frequency while making each output non-redundant.

**Scoring is weighted, not averaged.** The brief lists eight criteria without
weights, which can't produce a stable ranking — eight equal criteria let a topic
that's merely timely tie one that's genuinely fascinating. Five weighted core
criteria plus modifiers, with anchors at 2/5/8/10, makes a 7 mean the same thing
week to week.

**"Prefer Emerging and Rising" is applied once, in the score.** The stage
adjustment (+0.7 Emerging, −1.5 Saturated) encodes that preference numerically so
it doesn't get applied a second time by hand during ranking.
