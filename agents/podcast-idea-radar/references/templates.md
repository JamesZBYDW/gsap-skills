# Output templates

---

## PULSE note (hourly)

Deltas only. If a section is empty, omit the heading — do not write "None."
A quiet hour should be three lines, not a page.

```markdown
## Radar Pulse — 2026-08-07 09:00 (lanes C, F, A)

**New**
- **9.1** · Emerging · The Parents Quietly Replacing School With AI
  Breakout search +340% [SENTIMENT: 3 parenting subs, same week]. No major coverage yet.
  → *If a kid learns more from a chatbot than a classroom, what is school actually for?*

**Moved**
- **7.2 → 8.4** · Rising ← Emerging · The Loneliness Economy
  Picked up by Lane E (4 creators, independent). `major_outlets` 0 → 1.
- **6.8 → 6.1** · Peaking · Return-To-Office Ultimatums
  Coverage saturating, signal flat 48h.

**Killed**
- Celebrity divorce filing — routine celebrity news, no larger question.

**Notes**
- Lane F unreachable this run (no accessible Weibo mirror) — no China signal recorded.

**Push:** yes — new high scorer (9.1)
**Ledger:** +1 new, 2 updated, 1 killed
```

Quiet-hour version:

```markdown
## Radar Pulse — 2026-08-07 13:00 (lanes C, B, D)

No material change. 14 candidates scanned, all matched existing ledger topics
with no score movement above ±0.3.

**Push:** no
**Ledger:** 0 new, 3 signals appended
```

---

## REPORT (daily)

### Per idea, ranked strongest → weakest

```markdown
## #1 — The Parents Quietly Replacing School With AI

### The Story
[What happened / what people are discussing. Every factual claim tagged
[CONFIRMED] / [REPORTED] / [CLAIMED] / [SENTIMENT].]

### Why Now?
[Why this is gaining attention today — the specific development or signal.]

### The Bigger Question
> If a child learns more from a chatbot than a classroom, what is school for?

[The deeper question underneath the story. Not the headline restated — the
headline is "AI tutoring app goes viral"; the bigger question is the one above.]

### Why This Could Be a Great Podcast
[Why this sustains a real conversation. Name the sub-conversations it opens.]

### Discussion Angles
1. [What does this reveal about human behavior?]
2. [Who benefits? Who loses?]
3. [Is this actually new, or an old pattern with new tools?]
4. [What happens if this becomes normal?]
5. [What are people getting wrong about it?]

### Opposing Views
**Position A:** [A reasonable case, argued sincerely.]
**Position B:** [A genuinely different reasonable case.]
[Two real positions. Do not manufacture fake controversy — if only one
reasonable position exists, this topic should not have made the slate.]

### Trend Stage
Emerging

### Podcast Potential Score
**9.1** / 10 — [one line on what drove it]

### Research Trail
- [Article / primary source](url)
- [Reddit thread](url) — r/sub, N comments
- [Video](url) — creator, N views
- Creators to watch: [names]
- Search terms: `term one`, `term two`
```

### Special: Internet Conversations Worth Watching

3–5 conversations not yet strong enough for an episode. The early-warning
system. Draw from ledger topics scoring 5.5–7.0 with positive acceleration.

```markdown
## Internet Conversations Worth Watching

### 1. [Conversation]
- **What it is:** [one or two sentences]
- **Where it's appearing:** [lanes, communities, specific places]
- **Why it might grow:** [the mechanism — what would push it up]
- Current score: 6.4 · Stage: Emerging
```

### Special: China vs. US

Only when something real is there. **Omit the section entirely** rather than
manufacture a contrast.

```markdown
## China vs. US

### [Topic]
- **Chinese internet:** [what they're saying, where] [SENTIMENT]
- **Western internet:** [what they're saying, where] [SENTIMENT]
- **The interesting difference:** [what the divergence reveals]
- **Why it's a good episode:** [the discussion it opens]
```

### Final: TOP 3 I WOULD RECORD

```markdown
# TOP 3 I WOULD RECORD

## 1. [Working title]

**Why This One**
[Why it beats the other candidates — be comparative, name what it wins on.]

**Opening Hook**
> If an AI understands you better than your partner does, is choosing the AI
> actually irrational?

**The Central Debate**
[The core tension in exactly one sentence.]
```

---

## Push copy

One line. Under 200 characters. No markdown — it renders as plain text on a
phone. Lead with the score, then the thing worth acting on, then the evidence
that makes it credible.

| Rule | Format |
|------|--------|
| New high scorer | `9.1 Emerging — <hook>. <evidence>.` |
| Breakout | `<old> → <new> — <title>. <what changed>.` |
| Stage promotion | `Emerging → Rising (7.8) — <title>. <what confirmed it>.` |
| Daily digest | `Daily radar: <n> ideas. Top: <title> (<score>). Also: <2nd>, <3rd>.` |
| Retraction | `Retracted: <title>. <what was wrong>. Do not record.` |

Examples:

```
9.1 Emerging — parents hiring "AI tutors" they don't tell schools about. 3 subs + breakout search.
7.2 → 8.4 — The Loneliness Economy. 4 creators picked it up independently overnight.
Emerging → Rising (7.8) — men renting friends by the hour. Now in 2 major outlets.
Daily radar: 12 ideas. Top: The Parents Quietly Replacing School With AI (9.1). Also: Loneliness Economy, Rented Friends.
Retracted: "Startup pays users to delete Instagram" — claim traced to parody account. Do not record.
```

Never push a status line. `Hourly scan complete, found some topics` costs the
user's attention and returns nothing — that is exactly the case the gate exists
to suppress.

---

## Retraction note

When a previously pushed topic turns out to be false. Bypasses the push cap;
integrity beats quiet.

```markdown
## Retraction — 2026-08-07 15:00

**Topic:** [title] (ledger id: `slug`)
**Previously pushed:** 2026-08-06 11:00 at score 8.6
**What was wrong:** [the claim, and what it actually turned out to be]
**How it was caught:** [source that corrected it]
**Ledger:** `status: retracted`, score → 1.0

If this was on the recording shortlist, remove it.
```
