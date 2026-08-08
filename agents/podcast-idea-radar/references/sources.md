# Sources — lanes, rotation, and query patterns

Coverage comes from **rotation across the day**, not from exhaustiveness in any
single run. A `PULSE` scans three lanes; over five hours every lane gets hit
twice; over a day each is worked roughly five times.

---

## Hourly rotation

Every run scans **Lane C**. Then two rotating lanes, selected by local
hour-of-day:

| `hour % 5` | Rotating lanes |
|-----------|----------------|
| 0 | A + B |
| 1 | D + E |
| 2 | F + A |
| 3 | B + D |
| 4 | E + F |

Balanced by construction: over any five consecutive hours, each of A/B/D/E/F is
scanned exactly twice.

**Lane G (news) is not on the rotation.** It is pulled on demand whenever a
candidate needs factual verification — which is most of the time.

`REPORT` runs scan **all lanes** before rolling up, since the daily slate should
not be shaped by whichever lanes happened to land on that hour.

---

## Lane C — Search trends *(every run)*

The fastest leading indicator available, and the only lane that reliably shows a
topic before humans have finished writing about it. Sudden search growth is
attention that hasn't yet become content.

Look for: breakout queries, rapidly growing topics, new terminology appearing,
recurring questions, similar queries surfacing across different countries.

Query patterns:

- `google trends breakout searches <category> this week`
- `"searches for" surge <topic area> 2026`
- `trending searches <region> <month> 2026`
- New-term probe: when an unfamiliar phrase shows up in another lane, search it
  directly to see whether search volume confirms real growth or it's one
  community's in-joke.

A breakout query with no article behind it yet is the highest-value find the
radar can make. That is Emerging in its purest form.

---

## Lane A — Reddit

Where people argue at length in their own words. Best lane for Debate potential
and for authentic `[SENTIMENT]`.

Signal to hunt: **the same idea appearing in multiple unrelated subreddits within
a short window.** One thread is an anecdote. Three subs independently is a trend.

Standing sub list, by category:

| Area | Subs |
|------|------|
| Tech / AI | r/artificial, r/singularity, r/LocalLLaMA, r/ChatGPT |
| Money / work | r/antiwork, r/FluentInFinance, r/Entrepreneur, r/smallbusiness, r/overemployed |
| Relationships | r/relationship_advice, r/AmIOverreacting, r/dating_advice, r/Marriage |
| Culture | r/OutOfTheLoop, r/TrueOffMyChest, r/GenZ, r/Millennials, r/NYC |
| Weird | r/nosurf, r/offbeat, r/legaladvice, r/mildlyinfuriating |

Query patterns:

- `reddit <topic> rising discussion this week`
- `site:reddit.com <emerging term>` — to see how many communities have it
- `r/OutOfTheLoop what is going on with` — explicitly a "something is happening
  and people don't understand it yet" feed, which is a good Emerging detector

---

## Lane B — X / Twitter and creator discourse

Fastest to controversy and to the framing that will dominate a conversation.
Also the noisiest and most susceptible to manufactured outrage — treat
everything here as `[SENTIMENT]` until Lane G confirms it.

Hunt for: a claim being quote-tweeted into an argument, several unconnected
accounts landing on the same observation, a new piece of vocabulary spreading.

Query patterns:

- `twitter X discourse <topic> this week`
- `"<exact phrase>" twitter reaction`
- `X thread viral <topic area> August 2026`

Trace back to the original post. The first post usually explains the shape of the
discourse better than the hundredth.

---

## Lane D — Hacker News, startups, tech

Best lane for business-model weirdness and for the technically-literate
counter-argument that makes an episode balanced instead of credulous.

Query patterns:

- `hacker news discussion <topic> this week`
- `news.ycombinator.com <topic>`
- `unusual startup <category> funding 2026`
- `<technology> people are actually using it for`

The HN comment section is often a better Opposing Views source than any article,
because the objections are specific.

---

## Lane E — Video (YouTube / TikTok)

Detects what will be mainstream in two weeks. Video trends lead written coverage.

The signal that matters: **several creators independently covering the same
subject within days**, without citing each other. Coordinated coverage is
marketing; independent convergence is a trend.

Query patterns:

- `youtube video essay <topic> 2026`
- `tiktok trend <topic> August 2026`
- `creators talking about <emerging term>`
- `<topic> explained youtube views millions`

Also watch for a rapidly growing comment consensus that contradicts the video —
that gap is frequently the actual episode.

---

## Lane F — Chinese internet

Where accessible: **Weibo** (hot search / 热搜), **Douyin**, **Xiaohongshu**
(小红书), **Zhihu** (知乎), **Bilibili**, and Chinese news.

This lane earns its slot by producing contrasts the other lanes cannot. Identify
where Chinese and Western audiences are reacting **differently** to the same
thing, and where a conversation is well-developed in one internet and absent
from the other.

Focus areas: consumer behavior, relationships and marriage, parenting, work
culture (996, lying flat / 躺平), technology adoption, money and status, luxury,
lifestyle.

Query patterns:

- `weibo hot search topic <week> translated`
- `xiaohongshu trend <topic> 2026`
- `zhihu discussion <topic>`
- `chinese social media reaction <western topic>`
- `<topic> china vs us reaction difference`

Prefer sources that quote or translate original posts. If a lane is genuinely
unreachable in a run, record that in the pulse note — **never** infer what Chinese
users are probably saying. An invented cross-cultural contrast is the most
plausible-sounding and least detectable failure this agent can produce.

---

## Lane G — News *(on demand, verification)*

**Not a discovery lane.** News supplies the factual background behind
conversations the other lanes surface. It provides context; it does not
determine the topic list.

Use it to:

- Move a claim from `[CLAIMED]` or `[SENTIMENT]` up to `[REPORTED]` or
  `[CONFIRMED]`
- Establish the actual timeline of what happened
- Count `major_outlets` for the stage computation
- Find the specific detail that makes a topic concrete instead of abstract

Query patterns:

- `<topic> reporting <outlet-class> August 2026`
- `<viral claim> fact check`
- `<claim> original source`

A story becomes interesting once you identify the debate behind it, the cultural
implication, the human behavior involved, the business opportunity, the
contradiction, or the bigger question. If none of those is present, the news item
is a kill, no matter how large the story.

---

## Cross-lane confirmation

The strongest finds appear in **two or more lanes independently** in the same
window. That is what `lanes` counts in the ledger, and why it drives trend stage.

Highest-value combinations:

| Combination | Reads as |
|-------------|----------|
| **C + A** | Search breakout + multiple subs arguing = real and early |
| **A + E** | Communities arguing + creators converging = about to go mainstream |
| **F + any** | A conversation live in one internet, absent from the other |
| **C alone, repeatedly** | Purest Emerging: demand exists, supply hasn't caught up |

A topic in one lane only, with flat signal counts, is not yet a trend. Keep it as
`watching` and let the next rotation decide.
