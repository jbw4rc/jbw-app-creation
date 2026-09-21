# Sharp Board — NFL sharp money tracker

A web board that reads an NFL slate and tells you, per game, **which side the
public is on, which side the sharp money is on, and how strong that read is** —
then ranks the whole slate so the strongest sharp side is at the top.

Lives at `/nfl.html`; the NBA apron tool still lives at `/`. They share the
build and nothing else.

## The idea

You cannot see bet percentages without paying for them. You *can* see something
better for free: **the gap between books.**

Sharp books (Pinnacle, Circa, BetOnline) run thin margins and high limits. They
move on money and they tolerate winning bettors, so their number is the closest
thing to a true price. Retail books (DraftKings, FanDuel, BetMGM) run fat
margins and low limits, and they **shade their lines away from whatever the
public is loading up on** — that is how a book protects itself from a one-sided
ticket count.

So when retail sits off the sharp number, the direction of that shade is the
public's fingerprint. The side retail made *worse* is the side the public is on.
That inference is the engine's foundation, and it costs nothing but two books'
prices.

## Reading a line as one number

DraftKings at −2.5 (−120) and Pinnacle at −3 (−105) are nearly the same price,
but you cannot compare them by eye, and comparing juice alone is worse — a
half-point through 3 is worth several times a half-point through 9.

So every quote is stripped of vig and converted into the single number it
implies: **the expected margin (or total) that book is pricing**, assuming NFL
results scatter normally around the line (σ ≈ 13.45 for margins, ≈ 10 for
totals). Now every book is one scalar and they are all directly comparable,
whatever line and juice each posted. Every signal below is expressed in points
of that scale.

## The five signals

| Signal | Weight | What it catches |
|---|---:|---|
| **Sharp vs retail split** | 30 | How far retail has shaded off the sharp number, and toward whom. This is the public-side detector. |
| **Reverse line movement** | 25 | The line moved *against* the public side. Books do not move against their own hold by accident. |
| **Steam move** | 18 | A fast move, measured in points per hour. One group firing at once, not the public trickling in. |
| **Price move, line stuck** | 15 | The number sits on −3 while the juice walks −110 → −125. Money, quietly — the tell most people miss. |
| **Key number bought** | 12 | A book gave up 3 or 7. About one NFL game in ten lands exactly on 3; books surrender that number only when forced. |

Each returns a side and a strength from 0 to 1. Weighted contributions are
summed **signed**, so signals that agree add up and signals that disagree
cancel. The Sharp Score is the absolute value of that net, and the sharp side is
its direction.

That cancellation is the point. A game with one loud move and three reads
pointing the other way ranks *below* a game where everything lines up — which is
the ranking a bettor actually wants. Corroboration, not volume.

### Score bands

| Score | Reading |
|---|---|
| 45+ | Strong sharp side |
| 22–44 | Sharp lean |
| under 22 | No clear edge — the app refuses to name a side |

The bands are calibrated to what the engine can actually produce, not to the
theoretical 100. Full divergence credit needs a 1.5-point sharp/retail gap,
which essentially never happens; a genuinely strong game looks more like 0.8
points of shade plus a clean reverse move through a key number.

## Grading itself: closing line value

A board that names a sharp side every week and never checks itself is
unfalsifiable. The **Track record** tab is the check.

Once a game kicks off it can no longer change, so it is replayed once: the
engine is re-run at every poll it was priced in, the **first** poll where the
score cleared the lean band is taken as the entry, and the number available then
is compared against where the market closed. Positive CLV means the market kept
moving toward the flagged side — you got a better number than the market settled
on.

The measurement is strictly forward-looking. The signals read movement from
*before* the flag; the grade measures movement *after* it. Nothing grades the
engine on the data that triggered it, and `npm run verify:nfl` asserts that
every graded flag closed strictly after it was flagged.

Read the beat rate against **50%**, not against 100. A model finding real money
lands in the fifties or low sixties. Anything dramatically higher usually means
a bug, a tiny sample, or data leaking backwards — which is why the test suite
fails the fixture if its beat rate exceeds 85%.

**CLV is not profit.** Beating the close is the habit that makes bettors money
over time, but every individual bet still wins or loses on the field, and no
result is tracked here.

Finished games are moved out of the live snapshot series and into
`clvArchive.ts` by `scripts/archive-odds.ts`, which runs after every poll. That
is also what keeps `oddsHistory.ts` from growing without bound — so if that step
stops running, grades stop accruing.

## Getting live data

The app ships with **synthetic sample data** so it is explorable immediately.
It is labeled as such in the UI and in the file, and it is not real odds.

To go live:

1. Get a free key at [the-odds-api.com](https://the-odds-api.com/).
2. Add it as a repository secret named `ODDS_API_KEY`
   (Settings → Secrets and variables → Actions).
3. Run the **Build NFL odds** workflow once by hand, or wait for the schedule.

The first live poll replaces the sample file entirely. From then on each poll
appends a snapshot, and the accumulated series is what movement, steam and
reverse-line-movement are computed from — so **the reads get better the longer
it runs.** On the very first poll there is no history, the movement signals
report "n/a", and each game shows a partial read of 30 available points.

### The credit budget

Free tier is 500 credits/month. A poll costs `regions × markets` = 4 credits
(`us,eu` × `spreads,totals`), giving ~125 polls a month. The schedule runs 21 a
week — about 91 a month, or 364 credits — leaving roughly 34 polls of headroom
for manual triggers.

They are placed where the information is: **Monday through Saturday** at 10am
and 4pm ET to watch next week's numbers open and take their first money, an
overnight read, then four on Sunday between 9am and 1pm ET as the real money
lands. Monday matters more than it looks: it used to be skipped, leaving a
45-hour blind spot from Sunday evening to Tuesday morning sitting exactly where
fresh lines firm up.

`eu` is not optional — that is the region Pinnacle sits in, and Pinnacle is the
reference price the whole model leans on. Moneylines are deliberately skipped;
they would cost 50% more and tell us nothing the spread does not.

If you upgrade the plan, add Sunday entries first. That is where more resolution
buys the most, because a 30-minute poll gap smooths a real steam move into a
drift.

## Running it

```bash
npm install
npm run dev              # http://localhost:5173/nfl.html
npm run build            # type-check + build both apps
npm run verify:nfl       # headless checks on the engine
npm run verify:render    # drives the real page, compares it to the engine
npm run build:sample-odds   # regenerate the synthetic fixture
npm run archive:odds        # grade + retire finished games
ODDS_API_KEY=... npm run build:odds   # pull the live board
```

Regenerating the whole sample set, including the graded past weeks:

```bash
for w in 3 2 1; do
  node scripts/build-sample-odds.mjs --weeks-ago=$w && npm run archive:odds
done
node scripts/build-sample-odds.mjs
```

## Layout

```
nfl.html                       entry point
src/nfl/
  types.ts                     snapshot/quote domain types
  lib/
    stats.ts                   normal CDF/quantile, median
    books.ts                   which books are sharp, which are retail
    market.ts                  prices -> implied margin/total
    sharp.ts                   the five signals + Sharp Score
    clv.ts                     closing-line-value grading
    format.ts                  betting-convention display helpers
  data/oddsHistory.ts          GENERATED snapshot series
  data/clvArchive.ts           GENERATED graded games
  components/                  board, game row, market panel, signals, record
scripts/
  build-odds.mjs               live poll (CI)
  archive-odds.ts              grade + retire finished games (CI)
  build-sample-odds.mjs        synthetic fixture generator
  verify-nfl.ts                engine checks
```

## Why there are two test commands

`verify:nfl` checks the engine against fixtures. `verify:render` drives the
actual page in a browser and compares what it displays against what the engine
computed.

The second exists because every display bug in this project escaped the first:
a board that ranked in-play games at the top with scores of 83 while the engine
was fine, a table whose header lost a column so every row shifted right, a
timestamp that looked identical at ten minutes and twelve hours old, and a site
that served a stale build for hours while every workflow reported success.
Type checks and fixture tests cannot see any of those. Both bugs it was written
for were reproduced and confirmed to fail it before it was committed.

It needs a Chromium for Playwright — `npx playwright install chromium` on a
normal machine.

## Honest caveats

**The movement signals are not independent.** Reverse line movement, steam, and
price-versus-line all describe the same underlying move from different angles —
direction, velocity, and whether it hid in the juice. They reinforce each other
by design. Treat a score of 60 as "one well-corroborated move", not as four
separate pieces of evidence.

**Polling resolution is coarse.** On the free tier a move that happens inside
one polling window is smoothed into a drift, and genuine steam can be missed.

**The public-side read is an inference, not a measurement.** It is derived from
retail shading, not from bet percentages. It is usually right and occasionally
not — a retail book can be off the sharp number because of its own position, a
stale line, or a limit it does not want to take, none of which is public money.

**The sample track record is synthetic.** Its weeks are generated with
deliberately mixed outcomes so the panel does not advertise a beat rate no real
model produces. It measures nothing, and the first live game clears it out.

**A sharp side is not a winner.** This tracks where money is going. Sharp
bettors lose plenty of games, and following them into a number that has already
moved two points means you are getting a materially worse price than they got.
