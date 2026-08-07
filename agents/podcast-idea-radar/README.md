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

## How it runs

Two cadences over one shared memory:

**Hourly — `PULSE`.** A delta scan. Reads the topic ledger, scans three source
lanes (rotating, so everything gets covered across the day), and reports only
what *changed*: new topics, score movements, trend-stage promotions, kills. A
quiet hour says "no material change" in three lines. This is deliberate — a full
report every hour would hand you the same fifteen ideas twenty-four times.

**Daily — `REPORT`.** The full ranked slate: 10–15 ideas with the story, why now,
the bigger question, discussion angles, opposing views, trend stage, score, and a
research trail. Plus *Internet Conversations Worth Watching*, *China vs. US*
where a real contrast exists, and **TOP 3 I WOULD RECORD** with opening hooks.

The daily report is a roll-up of what the pulses accumulated, which is why the
hourly runs are cheap and the daily one is worth reading.

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

## The ledger is the point

`state/ledger.jsonl` is what makes an hourly cadence produce signal instead of
repetition. One line per topic, carrying score history, stage history, and every
source lane that has independently picked it up.

Three things fall out of it:

- **No repeats.** Topics are identified by their *underlying question*, not their
  headline — so three stories about three different AI companion apps collapse
  into one episode idea instead of cluttering three slots.
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
