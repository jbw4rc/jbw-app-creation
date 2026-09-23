// Generate a SYNTHETIC week of NFL odds so the app is explorable before a live
// key is wired up. Every scenario below is hand-built to exercise one of the
// five signals, which also makes this the fixture the engine is checked against.
// The first real poll from build-odds.mjs replaces this file entirely.
import { writeFileSync } from 'fs';
import { fairHomeProb, fairOverProb } from '../src/nfl/lib/outcomes';
import type { BookQuote, OddsHistory } from '../src/nfl/types';

// Prices come from the SAME push-aware margin model the app reads them back
// with. The generator used to price with a plain bell curve while the app
// read with key-number pushes, so every fixture line sitting on a 3 or 7
// re-implied a different margin than it was built from.
const probToAmerican = (p: number) => {
  const q = Math.min(0.97, Math.max(0.03, p));
  return q > 0.5 ? Math.round((-100 * q) / (1 - q)) : Math.round((100 * (1 - q)) / q);
};
/** Posted line + priced juice for a book that believes `mu`, holding `hold`. */
const spreadQuote = (mu: number, line: number, hold: number) => {
  const p = fairHomeProb(mu, line);
  return {
    homePoint: line, homePrice: probToAmerican(p * (1 + hold)),
    awayPoint: -line, awayPrice: probToAmerican((1 - p) * (1 + hold)),
  };
};
const totalQuote = (mu: number, line: number, hold: number) => {
  const p = fairOverProb(mu, line);
  return {
    point: line, overPrice: probToAmerican(p * (1 + hold)),
    underPrice: probToAmerican((1 - p) * (1 + hold)),
  };
};
const half = (x: number) => Math.round(x * 2) / 2;

const SHARP: [string, number][] = [['pinnacle', 0.025], ['circasports', 0.03], ['betonlineag', 0.04], ['bookmaker', 0.04]];
const RETAIL: [string, number][] = [['draftkings', 0.048], ['fanduel', 0.05], ['betmgm', 0.052],
  ['williamhill_us', 0.05], ['espnbet', 0.055], ['betrivers', 0.05]];

// marginPath / totalPath are the sharp consensus over 8 polls (Tue -> Sun am).
// shade is how far retail sits off sharp: positive = retail cheap on home,
// meaning the public is on the away side.
const GAMES = [
  { away: 'Baltimore Ravens', home: 'Kansas City Chiefs', day: 0, hour: 20,
    // Public is on the Chiefs; sharps bought Baltimore through the 3.
    marginPath: [-2.4, -2.5, -2.8, -3.1, -3.3, -3.4, -3.5, -3.6], shade: -1.0,
    totalPath: [47.4, 47.3, 47.2, 47.0, 46.9, 46.8, 46.6, 46.5], totalShade: -0.35 },

  { away: 'San Francisco 49ers', home: 'Seattle Seahawks', day: 0, hour: 20,
    // Textbook steam: flat, then one violent window Saturday.
    marginPath: [1.2, 1.2, 1.3, 1.2, 1.25, 2.35, 2.4, 2.45], shade: 0.5,
    totalPath: [44.2, 44.1, 44.2, 44.0, 44.1, 44.0, 43.9, 43.8], totalShade: -0.15 },

  { away: 'Dallas Cowboys', home: 'Philadelphia Eagles', day: 0, hour: 13,
    // Line frozen on -3; the price walks instead. Public on Dallas.
    marginPath: [3.0, 3.03, 3.06, 3.09, 3.12, 3.15, 3.18, 3.2], shade: 0.62,
    totalPath: [45.5, 45.5, 45.6, 45.5, 45.5, 45.6, 45.5, 45.5], totalShade: 0.05 },

  { away: 'Green Bay Packers', home: 'Chicago Bears', day: 0, hour: 13,
    // Big divergence, no movement yet — early-week sharp lean.
    marginPath: [-4.5, -4.5, -4.55, -4.5, -4.5, -4.45, -4.5, -4.5], shade: -0.95,
    totalPath: [42.5, 42.6, 42.8, 43.2, 43.6, 43.9, 44.1, 44.3], totalShade: -0.5 },

  { away: 'Buffalo Bills', home: 'Miami Dolphins', day: 0, hour: 13,
    // Public drift: line moves the SAME way the public leans. Not sharp.
    marginPath: [-5.5, -5.7, -5.9, -6.1, -6.3, -6.5, -6.6, -6.7], shade: 0.7,
    totalPath: [49.5, 49.6, 49.8, 50.0, 50.2, 50.3, 50.5, 50.5], totalShade: 0.4 },

  { away: 'Detroit Lions', home: 'Minnesota Vikings', day: 0, hour: 13,
    // Quiet game — everything agrees, nothing to play.
    marginPath: [-1.5, -1.5, -1.55, -1.5, -1.5, -1.5, -1.45, -1.5], shade: 0.06,
    totalPath: [48.5, 48.5, 48.4, 48.5, 48.5, 48.6, 48.5, 48.5], totalShade: 0.03 },

  { away: 'Cincinnati Bengals', home: 'Pittsburgh Steelers', day: 0, hour: 13,
    // Under steam on the total; spread is quiet.
    marginPath: [-1.0, -1.0, -1.1, -1.0, -1.05, -1.0, -1.0, -1.05], shade: 0.12,
    totalPath: [44.0, 43.9, 43.5, 42.9, 42.4, 42.0, 41.6, 41.4], totalShade: -0.8 },

  { away: 'Los Angeles Chargers', home: 'Denver Broncos', day: 0, hour: 16,
    // Bought through 7 toward the home side.
    marginPath: [6.4, 6.6, 6.9, 7.2, 7.4, 7.6, 7.7, 7.8], shade: 0.55,
    totalPath: [41.5, 41.4, 41.3, 41.2, 41.2, 41.1, 41.0, 41.0], totalShade: -0.2 },

  { away: 'Houston Texans', home: 'Jacksonville Jaguars', day: 0, hour: 13,
    marginPath: [1.5, 1.45, 1.4, 1.3, 1.2, 1.15, 1.1, 1.05], shade: 0.3,
    totalPath: [43.5, 43.6, 43.7, 43.8, 43.8, 43.9, 44.0, 44.0], totalShade: 0.22 },

  { away: 'New York Jets', home: 'New England Patriots', day: 0, hour: 13,
    marginPath: [-2.5, -2.4, -2.3, -2.2, -2.15, -2.1, -2.0, -1.95], shade: -0.4,
    totalPath: [39.5, 39.4, 39.3, 39.2, 39.1, 39.0, 38.9, 38.8], totalShade: -0.3 },

  { away: 'Tampa Bay Buccaneers', home: 'Atlanta Falcons', day: 0, hour: 13,
    marginPath: [-0.5, -0.6, -0.8, -1.0, -1.1, -1.2, -1.3, -1.35], shade: 0.45,
    totalPath: [47.0, 47.1, 47.0, 46.9, 46.9, 46.8, 46.8, 46.7], totalShade: -0.1 },

  { away: 'Las Vegas Raiders', home: 'Los Angeles Rams', day: 0, hour: 16,
    marginPath: [5.5, 5.6, 5.5, 5.4, 5.45, 5.5, 5.5, 5.55], shade: -0.25,
    totalPath: [46.5, 46.4, 46.5, 46.6, 46.5, 46.5, 46.4, 46.5], totalShade: 0.15 },

  { away: 'Arizona Cardinals', home: 'New Orleans Saints', day: 1, hour: 20,
    marginPath: [-1.5, -1.6, -1.8, -2.0, -2.1, -2.2, -2.3, -2.4], shade: 0.5,
    totalPath: [45.0, 45.0, 44.9, 44.8, 44.8, 44.7, 44.6, 44.6], totalShade: -0.18 },
];

// `--weeks-ago N` generates a finished week instead of the live one, so the
// track-record panel has something to grade. Those weeks apply LATE_DRIFT: a
// per-game nudge over the final polls that decides whether the market kept
// moving toward the flagged side or came back against it.
//
// This matters for honesty. Every scenario above is built so the line moves
// toward the sharp side, because that is what exercises the signals. Archiving
// those unchanged would show a 100% beat rate and imply the model is perfect.
// The drifts below are a deliberate mix — some continue, some stall, some
// reverse — so the sample track record lands somewhere plausible instead of
// advertising a number no model produces.
const WEEKS_AGO = Number(
  (process.argv.find((a) => a.startsWith('--weeks-ago=')) || '').split('=')[1] || 0
);
// Signed to oppose or extend each game's own sharp side, and big enough to
// actually overturn a move rather than dent it — the first pass used drifts
// far smaller than the base paths and produced a 100% beat rate.
// Indices 0, 1 and 6 oppose their game's sharp side; 2, 3 and 7 extend it.
// Totals need a bigger number than spreads to overturn, because the total
// paths travel further over the week.
const LATE_DRIFT = [1.8, -0.4, 0.4, -0.5, 0.3, 0.0, 3.0, 0.6, -0.2, 0.25, -0.3, 0.1, 0.4];
/**
 * Per-week magnitude, indexed by weeks-ago. All entries stay POSITIVE: a
 * negative multiplier inverts every sign at once, which turned each opposing
 * drift into a reinforcing one and pushed the sample beat rate back to ~95%.
 */
const WEEK_MULT = [0, 1, 0.55, 1.4];

// Poll times: Tue 10:00Z through Sun 15:00Z, the shape the workflow polls on.
const BASE = new Date(Date.parse('2026-09-15T10:00:00Z') - WEEKS_AGO * 7 * 86400000);
const POLL_HOURS = [0, 24, 48, 72, 96, 110, 120, 125];
// Kickoffs hang off the Sunday of that week; `day` offsets to Monday night.
const SUNDAY = Date.UTC(2026, 8, 20) - WEEKS_AGO * 7 * 86400000;

const snapshots = POLL_HOURS.map((h, t) => {
  const takenAt = new Date(BASE.getTime() + h * 3600 * 1000).toISOString();
  const games = GAMES.map((g, gi) => {
    // ET -> UTC is +4 during the season.
    const kickoff = new Date(SUNDAY + (g.day * 24 + g.hour + 4) * 3600 * 1000);
    // In past-week mode the last three polls carry the drift, scaled in so the
    // move lands gradually rather than as a phantom steam spike.
    // Each drift's SIGN is matched to that game's own sharp side, so rotating
    // the array across weeks would scramble the intent. Vary magnitude instead:
    // a per-week multiplier keeps the sign meaningful and can invert a whole
    // week, so successive sample weeks do not resolve identically.
    const drift = WEEKS_AGO > 0 ? LATE_DRIFT[gi] * (WEEK_MULT[WEEKS_AGO] ?? 1) : 0;
    const tail = Math.max(0, t - (POLL_HOURS.length - 4));
    const lateMargin = drift * (tail / 3);
    const sharpMu = g.marginPath[t] + lateMargin;
    const sharpTot = g.totalPath[t] + lateMargin * 0.8;
    const books: BookQuote[] = [];

    for (const [key, hold] of SHARP) {
      // Small per-book disagreement so the median is doing real work.
      const jitter = ((gi + key.length) % 3 - 1) * 0.04;
      const mu = sharpMu + jitter;
      const tot = sharpTot + jitter * 0.6;
      books.push({
        book: key,
        spread: spreadQuote(mu, half(-mu), hold),
        total: totalQuote(tot, half(tot), hold),
      });
    }
    for (const [key, hold] of RETAIL) {
      const jitter = ((gi + key.length) % 3 - 1) * 0.05;
      const mu = sharpMu - g.shade + jitter;
      const tot = sharpTot - g.totalShade + jitter * 0.6;
      books.push({
        book: key,
        spread: spreadQuote(mu, half(-mu), hold),
        total: totalQuote(tot, half(tot), hold),
      });
    }

    return {
      id: `sample-w${3 - WEEKS_AGO}-${gi}`,
      commenceTime: kickoff.toISOString(),
      homeTeam: g.home,
      awayTeam: g.away,
      books,
    };
  });
  return { takenAt, games };
});

const history: OddsHistory = {
  updatedAt: snapshots[snapshots.length - 1].takenAt,
  sample: true,
  week: 3 - WEEKS_AGO,
  season: 2026,
  snapshots,
};

// Writes to its OWN file. It used to share oddsHistory.ts with the live
// poller, which meant regenerating the fixture would silently destroy real
// accumulated history, and the test suite's fixture assertions broke the
// moment live data arrived. The two are now completely separate.
const banner =
  `// GENERATED by scripts/build-sample-odds.ts — SYNTHETIC SAMPLE DATA.\n` +
  `// Not real odds. Used by the test suite, and shown by the app only while no\n` +
  `// live snapshot exists. The live poller never touches this file.\n` +
  `import type { OddsHistory } from '../types';\n\n` +
  `export const sampleHistory: OddsHistory = `;

writeFileSync('src/nfl/data/sampleHistory.ts',
  `${banner}${JSON.stringify(history, null, 2)};\n`);
console.log(
  `Wrote sample history: ${snapshots.length} snapshots x ${GAMES.length} games` +
    (WEEKS_AGO ? ` (week ${3 - WEEKS_AGO}, finished)` : ' (live week)')
);
