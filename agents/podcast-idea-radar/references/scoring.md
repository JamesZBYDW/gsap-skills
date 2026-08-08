# Scoring — podcast potential, 1–10

Score for **podcast potential**, never for popularity. A small emerging
conversation with an interesting question underneath is worth more than the
biggest news story of the day, because everyone has already said everything
about the biggest news story of the day.

The anchors below exist so a 7 means the same thing this week as it did last
week. Scores drive the ranking, the push gate, and the Watchlist cutoff — an
uncalibrated score corrupts all three.

---

## Step 1 — weighted core

Rate each 1–10 against its anchors, then apply the weight.

| Criterion | Weight |
|-----------|--------|
| Curiosity | 0.25 |
| Debate potential | 0.20 |
| Depth | 0.20 |
| Originality | 0.20 |
| Timeliness | 0.15 |

`base = 0.25·Cur + 0.20·Deb + 0.20·Dep + 0.20·Ori + 0.15·Tim`

### Curiosity — would someone click because they genuinely want to know more?

| | |
|---|---|
| **2** | Reader already knows how it ends. No open loop. |
| **5** | Mildly interesting; they'd read a headline, not seek it out. |
| **8** | Opens a loop they want closed. They'd stop scrolling. |
| **10** | They'd send it to someone before finishing it. |

### Debate potential — are there reasonable opposing viewpoints?

| | |
|---|---|
| **2** | Everyone already agrees. Nothing to argue. |
| **5** | Disagreement exists but is mostly about facts, not values. |
| **8** | Two positions a smart person could hold sincerely. |
| **10** | Hosts might genuinely land on different sides on air. |

Avoid topics where everyone already agrees. **Do not manufacture fake
controversy** — if there is honestly one reasonable side, score it low and let
it die. That is the correct outcome, not a failure of imagination.

### Depth — can this sustain at least 30 minutes of meaningful conversation?

| | |
|---|---|
| **2** | One fact. Exhausted in three minutes. |
| **5** | ~15 minutes, then it's repetition. |
| **8** | Branches into several sub-conversations; 45+ minutes. |
| **10** | Could be a series. Every angle opens another. |

Test: name three distinct sub-conversations without repeating. Can't → ≤5.

### Originality — can we add a perspective instead of repeating coverage?

| | |
|---|---|
| **2** | Every outlet and three podcasts have said exactly this. |
| **5** | Covered, but our angle is somewhat fresh. |
| **8** | Coverage exists but nobody has framed it this way. |
| **10** | The framing itself is the contribution. |

### Timeliness — why discuss this *now*?

| | |
|---|---|
| **2** | No reason it's this week rather than any week. |
| **5** | Loosely tied to something current. |
| **8** | A specific recent development makes now the moment. |
| **10** | Now or the window closes. |

---

## Step 2 — modifiers

Applied additively to `base`.

**Surprise · `+0.0 … +1.0`** — does it contain something unexpected,
counterintuitive, strange, or genuinely controversial? Reserve the top of the
range for the *"wait… what?"* reaction. That reaction is the single best
predictor of an episode people finish.

**Human relevance · `+0.0 … +0.8`** — does it connect to money, relationships,
ambition, fear, identity, family, technology, status, power, or happiness? Count
the threads: one → +0.2, two or three → +0.5, four or more → +0.8.

**Longevity · `−1.0 … +0.5`** — will the episode still be interesting after the
news cycle? Dies with the cycle → −1.0. Still interesting in six months → +0.5.

**Trend stage · fixed**

| Stage | Adjustment |
|-------|-----------|
| Emerging | **+0.7** |
| Rising | **+0.4** |
| Mainstream | 0.0 |
| Peaking | **−0.5** |
| Saturated | **−1.5** |

This adjustment *is* the "prefer Emerging and Rising when quality is comparable"
rule from the brief. It is already applied here — do not also favor early-stage
topics by hand when ranking, or the preference gets counted twice.

`score = clamp(base + surprise + relevance + longevity + stage, 1.0, 10.0)`

Round to one decimal.

---

## Step 3 — kill rules

Hard rejects. Write to the ledger with `status: killed` and a `kill_reason` so
the topic does not reappear next hour.

- Generic political headline with no cultural question underneath
- Routine celebrity news
- Sports scores or results
- Stock market or index summaries
- Simple product launch, press release, or routine corporate announcement
- Popular but intellectually empty — nothing to actually discuss
- Cannot support meaningful conversation at any length

**Celebrity exception:** keep it only when it opens a larger discussion about
culture, relationships, business, psychology, media, or society. "Two stars
split" is a kill. "Two stars split and the internet's reaction reveals how people
now think about prenups" is a topic.

### Caps, not kills

| Condition | Cap |
|-----------|-----|
| Uncorroborated viral claim (no `[CONFIRMED]` or `[REPORTED]` evidence) | **5.0** until it clears |
| Debate ≤3 — everyone agrees | **6.0** |
| Depth ≤3 — can't sustain 30 minutes | **5.0** |
| Already covered by ≥3 major podcasts | **6.0** |

Caps apply after modifiers. A capped topic stays in the ledger and can rise if
the blocker clears — corroboration arrives, a credible counter-position emerges.
That recovery is exactly what the breakout push rule is designed to catch.

---

## Thresholds

| Score | Meaning |
|-------|---------|
| **≥ 8.0** | Record-worthy. Push on first appearance. |
| **7.0 – 7.9** | Strong. Belongs in the daily slate. |
| **5.5 – 6.9** | Watchlist — "Internet Conversations Worth Watching". |
| **< 5.5** | Not reported. Keep in ledger as `watching` if acceleration is positive. |

---

## Worked example

*Parents quietly replacing school with AI tutors, hiding it from teachers.*

| Criterion | Score | Reasoning |
|-----------|-------|-----------|
| Curiosity | 9 | The secrecy is the hook — why hide it? |
| Debate | 9 | Rational parent optimizing vs. abandoning a civic institution |
| Depth | 8 | Branches: credentialing, teacher authority, inequality, what school is for |
| Originality | 8 | AI-in-education is covered; parents *concealing* it is not |
| Timeliness | 7 | Breakout search activity this week, no major coverage yet |

`base = 0.25(9) + 0.20(9) + 0.20(8) + 0.20(8) + 0.15(7) = 8.30`

Modifiers: Surprise **+0.8** (the concealment) · Relevance **+0.8** (family,
money, status, technology) · Longevity **+0.5** (structural, not a cycle) ·
Stage **Emerging +0.7**

`8.30 + 2.8 = 11.10 → clamp → 10.0`

Clamping at 10.0 is a signal in itself: when a topic pins the scale, the
modifiers are doing more work than the core, which usually means one of the core
criteria was scored conservatively. Re-check before shipping a 10.0 — and if it
survives the re-check, it is the day's lead.
