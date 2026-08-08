# Trend proof — showing a topic is actually trending

The evidence tiers in AGENT.md § Research standards establish whether a **claim is
true**. They do not establish that the topic is **actually trending**. Those are
different questions, and conflating them is how a radar starts reporting vibes.

"This is trending" is a quantitative claim. It requires a number.

---

## The requirement

**Every reported topic carries at least one Trend Proof.** No exceptions, and
"multiple people are talking about it" is not one.

A Trend Proof has all five fields. Missing any one of them means it is not proof:

| Field | Example |
|-------|---------|
| **Metric** | what was measured — `"how to touch grass"` search volume |
| **Value** | the number — `Breakout (>5,000%)` |
| **Window** | over what period — `past month` |
| **Source** | a URL |
| **Tier** | T1–T5, per the table below |

A percentage with no window is meaningless. A window with no number is a vibe. A
number with no URL is unverifiable. Record all five or drop the topic.

---

## Source tiers

Ranked by how hard the number is to fake or spin.

| Tier | What it is | Examples | Counts as proof? |
|------|-----------|----------|------------------|
| **T1** | The platform publishing its own measurement | Google Trends / blog.google, Strava press releases, Yelp data, Eventbrite data, official platform reports, a league's own membership figures | ✅ Yes — strongest |
| **T2** | Reputable outlet reporting a *named* source with a *number* | CNN, Fortune, Forbes, Axios, WBUR, Reuters citing measured data | ✅ Yes |
| **T3** | Industry or trade research with stated methodology | trade associations, analyst reports, named cross-source aggregations | ✅ Yes |
| **T4** | A company's own trend report | retailer "trend reports", brand-published surveys | ⚠️ Only with a second independent T1–T3 source |
| **T5** | Brand blogs, content farms, SEO trend pages, aggregator sites | marketing blogs, `*.camp`/shop-blog trend posts, listicle sites | ❌ **Never** |

**T4 is usable but must be labeled.** A craft retailer reporting that craft
searches are up has real data and a commercial interest in that data pointing one
way. Cite it, name the conflict, and pair it with something independent.

**T5 is not proof, ever** — but it is often a *lead*. A marketing blog citing
"Strava reported 59%" is a pointer: go find the Strava press release and cite
that. Chase the number to its origin, then cite the origin.

---

## Scoring consequences

Enforced, not advisory:

| Situation | Consequence |
|-----------|-------------|
| No T1–T3 Trend Proof | **Score capped at 6.0**, and stage cannot exceed `Emerging` |
| Only T4 proof, nothing independent | **Score capped at 7.0**, label the commercial interest |
| Trend Proof exists but the underlying factual claim is uncorroborated | the existing 5.0 viral-claim cap still applies |
| Trend Proof is T5 only | **not reportable** — either chase it to the primary or drop it |

An Emerging topic is allowed thin proof — that's what Emerging *means*, and a
single T1 breakout signal with no coverage yet is the most valuable find the radar
makes. What is never allowed is calling something Rising or Mainstream without a
measurement behind it.

---

## Cross-source counting is not proof of a trend

Seeing a topic in three lanes proves **attention is distributed**. It does not
prove attention is **growing**. Those are different claims:

- *Distributed* → supports the trend **stage** computation (`lanes` count)
- *Growing* → requires a Trend Proof with a number and a window

A topic can be in five lanes and flat. That's `Peaking`, not `Rising`, and the
only way to tell is a measured delta over time.

---

## Worked example

*Analog hobbies as anti-AI status signal* — how the proof stacks:

```
T1  Mahjong club searches +~4,500% YoY            (Yelp data)
T1  Mahjong events +179% nationwide 2023→2024     (Eventbrite data)
T1  NMJL membership 32 → 350,000+                 (league's own figure)
T2  Yarn kit searches +1,200% in 2025             (CNN)
T4  Analog hobby searches +136% / 6mo             (Michaels — retailer, flag it)
T4  Yarn accessory sales +40% YoY                 (Michaels — same conflict)
```

Four independent T1/T2 proofs with numbers and windows, plus two T4 figures that
corroborate but don't carry the claim alone. That clears the bar comfortably and
the T4 conflict is disclosed rather than hidden.

Contrast the failure mode this file exists to prevent: citing a craft shop's blog
post asserting "+1,200%" and tagging it `[REPORTED]`. The number happened to be
right, but nothing about that citation could establish it. Chase it to CNN, cite
CNN.

---

## In output

Every topic's **Research Trail** leads with its Trend Proofs, formatted so the
number and the tier are both visible at a glance:

```markdown
### Research Trail
**Trend proof**
- `mahjong club searches` **+4,500%** YoY — Yelp data via [WBUR](url) `T1/T2`
- `mahjong events` **+179%** nationwide 2023→2024 — Eventbrite via [Axios](url) `T1/T2`
- `yarn kits` **+1,200%** in 2025 — [CNN](url) `T2`
- `analog hobby searches` **+136%** / 6mo — [Michaels](url) `T4 — retailer, commercial interest`

**Further reading**
- …
```

If a reader cannot check the trend claim in one click, the trail has failed.
