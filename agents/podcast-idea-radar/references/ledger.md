# Ledger — state schema, dedup, and stage computation

The ledger is the radar's memory. Without it, an hourly agent is just a daily
agent run twenty-four times.

File: `state/ledger.jsonl` — newline-delimited JSON, one object per topic.
JSONL is chosen deliberately: appends never rewrite the file, and a corrupt line
costs one topic instead of the whole store.

---

## Record schema

```json
{
  "id": "ai-tutors-parents-hide-from-schools",
  "fingerprint": "parents secretly outsourcing schooling to AI; who is accountable for what a child learns",
  "title": "The Parents Quietly Replacing School With AI",
  "question": "If a kid learns more from a chatbot than a classroom, what is school actually for?",
  "first_seen": "2026-08-05T14:00:00Z",
  "last_seen": "2026-08-07T09:00:00Z",
  "status": "active",
  "score": 9.1,
  "score_history": [
    { "t": "2026-08-05T14:00:00Z", "v": 7.4 },
    { "t": "2026-08-06T11:00:00Z", "v": 8.2 },
    { "t": "2026-08-07T09:00:00Z", "v": 9.1 }
  ],
  "stage": "Rising",
  "stage_history": [
    { "t": "2026-08-05T14:00:00Z", "v": "Emerging" },
    { "t": "2026-08-07T09:00:00Z", "v": "Rising" }
  ],
  "lanes": ["A", "C", "E"],
  "major_outlets": 1,
  "signals": [
    { "t": "2026-08-05T14:00:00Z", "lane": "A", "note": "3 parenting subs, same week", "url": "https://…" },
    { "t": "2026-08-07T09:00:00Z", "lane": "C", "note": "breakout query +340%", "url": "https://…" }
  ],
  "evidence": [
    { "tier": "REPORTED", "claim": "district piloting detection tooling", "url": "https://…" },
    { "tier": "SENTIMENT", "claim": "parents describe hiding it from teachers", "url": "https://…" }
  ],
  "pushed_at": ["2026-08-07T09:00:00Z"],
  "kill_reason": null
}
```

### Field notes

| Field | Purpose |
|-------|---------|
| `id` | Stable kebab-case slug. Never changes once assigned, even if the title is rewritten. |
| `fingerprint` | One sentence naming the **underlying question**. The dedup key. See below. |
| `title` | Current working episode title. May be rewritten freely as understanding improves. |
| `question` | The Bigger Question, as it will appear in the report. |
| `status` | `active` · `watching` · `killed` · `recorded` · `retracted` · `expired` |
| `score` | Current composite, per `scoring.md`. |
| `score_history` | Append on every change. Drives the breakout push rule. |
| `stage` | Computed, never guessed. See stage rules below. |
| `lanes` | Distinct source lanes that have independently carried the topic. Drives stage. |
| `major_outlets` | Count of reputable outlets covering it. Separates Rising from Mainstream. |
| `signals` | Evidence of *attention*, timestamped. Drives acceleration. |
| `evidence` | Evidence of *fact*, tiered per the Research Standards table. |
| `pushed_at` | Timestamps of pushes about this topic. Enforces the daily cap and prevents re-pushing. |
| `kill_reason` | Set when `status: killed`, so later runs don't resurface it. |

---

## The dedup identity rule

**A topic is identified by its underlying question, not by its headline.**

This is the single most important rule in the ledger, and the one that decides
whether the hourly cadence produces signal or noise. Headlines multiply; the
question underneath does not.

Two candidates are the **same topic** when swapping one for the other would not
change the episode you'd record. Three different stories about three different
apps are one topic if the conversation is the same conversation.

Worked example — all of these are **one** ledger record:

- "AI girlfriend app hits 10M downloads"
- "Man marries chatbot in ceremony"
- "Therapists report clients preferring AI to partners"

Fingerprint: *people finding AI emotionally easier than other people; what that
does to real relationships.*

They are **different** topics when the bigger question diverges even though the
subject matter overlaps:

- *"What happens when AI is emotionally easier than people?"* (relationships)
- *"Who is liable when a companion app tells a teenager something harmful?"*
  (accountability)

Same industry, same week, genuinely different episodes.

### Procedure

For each candidate, before scoring:

1. Write the candidate's fingerprint — one sentence, the underlying question.
2. Compare against every `active`, `watching`, and `killed` fingerprint.
3. **Match** → append a signal, recompute score and stage, update `last_seen`.
   Do not create a record. If the match was `killed`, leave it killed unless the
   new evidence defeats the original `kill_reason`.
4. **No match** → new record with a fresh `id`.

When genuinely torn, merge. An over-merged topic produces one strong episode
idea with unusually rich evidence. An under-merged topic produces three thin
ideas that compete with each other in the ranking and make the slate look
padded.

---

## Trend stage computation

Stage is derived from the ledger, not from feel. Evaluate top to bottom; first
match wins.

| Stage | Conditions |
|-------|-----------|
| **Saturated** | ≥3 major podcasts/creators have already covered it, **or** at Mainstream+ for >14 days |
| **Peaking** | `major_outlets` ≥3 **and** Δlanes ≤0 over 48h — wide coverage, attention no longer growing |
| **Mainstream** | `major_outlets` ≥3 **and** still growing |
| **Rising** | `lanes` ≥3 **or** Δlanes ≥+2 over 24h, with `major_outlets` ≤2 |
| **Emerging** | `lanes` ≤2, `major_outlets` 0, and Δsignals ≥+1 over 24h |
| **watching** | In the ledger but no new signal in 48h — not a stage; set `status: watching` |

Δlanes and Δsignals come from the timestamps in `signals`, which is why signals
must always be recorded with a `t` and a `lane`.

**Emerging → Rising is the money transition.** A topic caught at Emerging and
confirmed accelerating to Rising is exactly the early-warning case the radar
exists to produce, which is why it has its own push rule.

### Retirement

Every `PULSE` run, before scanning:

- No new signal in **7 days** → `status: expired`.
- `Saturated` for **3 consecutive days** → `status: expired`.
- Recorded as an episode → `status: recorded` (never resurfaces).

Expired records stay in the file. They are the archive, and they keep the agent
from re-discovering the same topic in three weeks as if it were new.

---

## Integrity

- **Append-only in spirit.** Update fields in place, but never delete a record
  and never rewrite `score_history`, `stage_history`, or `signals` — only append
  to them. The histories are what make acceleration computable.
- **One writer.** Runs are hourly and sequential, so no locking is needed. If a
  run finds the ledger mid-write or malformed, skip the bad line, note it in the
  pulse, and continue — never truncate the file to recover.
- **Cap growth.** Above ~500 records, move everything `expired` or `recorded`
  older than 90 days to `state/archive/ledger-YYYY-QN.jsonl`. Dedup only needs
  to check the active file plus kills.
