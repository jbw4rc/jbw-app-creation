// Poll The Odds API for the NFL board and append a snapshot to
// src/nfl/data/oddsHistory.ts. Runs in CI on a schedule; each run commits one
// more snapshot, and the accumulated file is the app's line-movement history.
//
// CREDIT BUDGET — the reason the schedule looks the way it does.
// The Odds API free tier is 500 credits/month. A request costs
// (regions x markets) credits, so our regions=us,eu + markets=spreads,totals
// is 4 credits per poll. That is ~125 polls a month, or about 4 a day. The
// workflow spends them where the information is: a few checks midweek to catch
// the opener and early sharp money, then tighter on Sunday morning when the
// real money lands. Adding h2h (moneyline) would cost 50% more for a market
// that tells us nothing the spread does not.
import { readFileSync, writeFileSync, existsSync } from 'fs';

const API_KEY = process.env.ODDS_API_KEY;
if (!API_KEY) {
  console.error('ODDS_API_KEY is not set — add it as a repository secret.');
  process.exit(1);
}

const OUT = 'src/nfl/data/oddsHistory.ts';
const SPORT = 'americanfootball_nfl';
const REGIONS = 'us,eu';   // eu is where Pinnacle lives — the whole point
const MARKETS = 'spreads,totals';

/** Keep the file from growing without bound. */
const MAX_SNAPSHOTS = 400;
/**
 * Backstop only. Finished games are normally removed by archive-odds.ts, which
 * grades them into the CLV archive first. This exists so a broken archive step
 * cannot grow the committed file without bound — it must stay well clear of the
 * archive window, or it would delete games before they are ever graded.
 */
const STALE_HOURS = 24 * 14;

const url =
  `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
  `?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS}` +
  `&oddsFormat=american&dateFormat=iso`;

console.log('Polling The Odds API…');
const res = await fetch(url);
if (!res.ok) {
  throw new Error(`Odds API ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
console.log(
  `  credits used ${res.headers.get('x-requests-used')}, ` +
    `remaining ${res.headers.get('x-requests-remaining')}`
);

const raw = await res.json();
console.log(`  ${raw.length} games on the board`);

/** Pull the two-way outcome pair out of one book's market. */
const outcome = (market, name) => market?.outcomes?.find((o) => o.name === name);

const games = [];
for (const g of raw) {
  const books = [];
  for (const bm of g.bookmakers ?? []) {
    const spreads = bm.markets?.find((m) => m.key === 'spreads');
    const totals = bm.markets?.find((m) => m.key === 'totals');

    const home = outcome(spreads, g.home_team);
    const away = outcome(spreads, g.away_team);
    const over = outcome(totals, 'Over');
    const under = outcome(totals, 'Under');

    const quote = { book: bm.key };
    if (home?.point != null && away?.point != null) {
      quote.spread = {
        homePoint: home.point,
        homePrice: home.price,
        awayPoint: away.point,
        awayPrice: away.price,
      };
    }
    if (over?.point != null && under?.point != null) {
      quote.total = { point: over.point, overPrice: over.price, underPrice: under.price };
    }
    if (quote.spread || quote.total) books.push(quote);
  }
  if (books.length === 0) continue;
  games.push({
    id: g.id,
    commenceTime: g.commence_time,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    books,
  });
}

const snapshot = { takenAt: new Date().toISOString(), games };

// --- Merge with whatever history is already committed. ---
let history = { updatedAt: null, sample: false, week: null, season: null, snapshots: [] };
const MARKER = 'export const oddsHistory: OddsHistory = ';
if (existsSync(OUT)) {
  const prior = readFileSync(OUT, 'utf8');
  // Slice from the ASSIGNMENT, not the first brace in the file: the first
  // brace belongs to `import type { OddsHistory }`, so indexing on it yields
  // garbage that fails to parse. That failure used to be swallowed, and every
  // poll silently restarted the history from scratch — which would have left
  // the file permanently one snapshot long and movement signals permanently
  // dead, with nothing in the logs to say so.
  const at = prior.indexOf(MARKER);
  if (at === -1) throw new Error(`${OUT} has no '${MARKER}' — refusing to overwrite it blindly`);
  const json = prior.slice(at + MARKER.length, prior.lastIndexOf('}') + 1);

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    // Never silently discard accumulated history — it is unrecoverable.
    throw new Error(`Could not parse ${OUT}: ${err.message}`);
  }
  // A sample file is scaffolding — the first real poll replaces it outright.
  if (!parsed.sample) {
    history = parsed;
    console.log(`  carrying forward ${history.snapshots.length} existing snapshot(s)`);
  } else {
    console.log('  replacing sample history with live data');
  }
}

history.snapshots.push(snapshot);

// Prune: backstop only (see STALE_HOURS), then cap the series.
const staleBefore = Date.now() - STALE_HOURS * 3600 * 1000;
history.snapshots = history.snapshots
  .map((s) => ({
    ...s,
    games: s.games.filter((g) => new Date(g.commenceTime).getTime() > staleBefore),
  }))
  .filter((s) => s.games.length > 0)
  .slice(-MAX_SNAPSHOTS);

history.updatedAt = snapshot.takenAt;
history.sample = false;
history.season = nflSeason(new Date());
history.week = nflWeek(new Date());

/** NFL season year — the season is named for the year it starts in. */
function nflSeason(d) {
  return d.getUTCMonth() < 2 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
}

/** Week number, counting from the Thursday after Labor Day. */
function nflWeek(d) {
  const season = nflSeason(d);
  const sept1 = new Date(Date.UTC(season, 8, 1));
  // Labor Day = first Monday in September; kickoff Thursday is 3 days later.
  const labor = new Date(sept1);
  while (labor.getUTCDay() !== 1) labor.setUTCDate(labor.getUTCDate() + 1);
  const kickoff = new Date(labor);
  kickoff.setUTCDate(kickoff.getUTCDate() + 3);
  const weeks = Math.floor((d - kickoff) / (7 * 24 * 3600 * 1000)) + 1;
  return weeks >= 1 && weeks <= 22 ? weeks : null;
}

const banner =
  `// GENERATED by scripts/build-odds.mjs — do not edit by hand.\n` +
  `// ${history.snapshots.length} snapshots, latest ${history.updatedAt}.\n` +
  `import type { OddsHistory } from '../types';\n\n` +
  `export const oddsHistory: OddsHistory = `;

writeFileSync(OUT, `${banner}${JSON.stringify(history, null, 2)};\n`);
console.log(
  `Wrote ${OUT} — ${history.snapshots.length} snapshots, ${games.length} games in the newest.`
);
