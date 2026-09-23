// Headless sanity checks for the sharp-money engine. Run:
//   npx tsx scripts/verify-nfl.ts
// The sample history in src/nfl/data is built so each scenario lights up a
// specific signal; these checks assert that it does.
// The suite asserts on the synthetic fixtures, which are deliberately built so
// each scenario lights up one signal. It must NOT read the live files — those
// change under it every time the poller runs, and its scenario checks would
// then fail for reasons that have nothing to do with the code.
import { sampleHistory as oddsHistory } from '../src/nfl/data/sampleHistory';
import { sampleClv as clvArchive } from '../src/nfl/data/sampleClv';
import { readSlate, sideLabel, scoreBand, readGameAt, LEAN_MIN, STRONG_MIN } from '../src/nfl/lib/sharp';
import { summarize, resolveGame } from '../src/nfl/lib/clv';
import type { Snapshot } from '../src/nfl/types';
import { impliedMargin, noVig, findGame } from '../src/nfl/lib/market';
import { spreadOutcomeAt } from '../src/nfl/lib/outcomes';
import { evPer100, recommend, BET_MIN_EV } from '../src/nfl/lib/edge';
import type { GameRead } from '../src/nfl/lib/sharp';
import type { BookQuote, GameQuote } from '../src/nfl/types';

let failures = 0;
const check = (name: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!pass) failures++;
};

console.log('\n— price plumbing —');
check('no-vig of -110/-110 is 0.500', Math.abs(noVig(-110, -110) - 0.5) < 1e-9);
// Even money on a key number is not exactly the number: with pushes modelled,
// the margins either side of 3 are not symmetric. Close, not equal.
check(
  'home -3 at even money implies mu ≈ 3',
  Math.abs(impliedMargin({ homePoint: -3, homePrice: 100, awayPoint: 3, awayPrice: 100 }) - 3) < 0.15
);
check(
  'juicing the home side raises implied margin',
  impliedMargin({ homePoint: -3, homePrice: -130, awayPoint: 3, awayPrice: 110 }) > 3.1
);

const slate = readSlate(oddsHistory);
console.log(`\n— slate: ${slate.length} games —`);
check('every game produced a read', slate.length === 13);
check(
  'ranked descending by score',
  slate.every((g, i) => i === 0 || slate[i - 1].best.score >= g.best.score)
);

const byName = (home: string) => slate.find((g) => g.homeTeam.includes(home))!;

console.log('\n— scenario: key number bought through 3 (KC) —');
const kc = byName('Kansas City');
check('spread flags the key number', kc.spread.signals.find((s) => s.id === 'keyNumber')!.strength > 0);
check('reverse line movement fires', kc.spread.signals.find((s) => s.id === 'reverseMove')!.strength > 0.5);
check('sharp side is the road team', kc.spread.sharpSide === 'away', sideLabel(kc.spread.sharpSide, kc));
check('public is on the home team', kc.spread.squareSide === 'home');
check('scores as a real play', kc.spread.score > 40, kc.spread.score.toFixed(1));

console.log('\n— scenario: steam (SEA) —');
const sea = byName('Seattle');
check('steam signal fires', sea.spread.signals.find((s) => s.id === 'steam')!.strength > 0.5);
check('slow drift is NOT counted as steam',
  byName('Miami').spread.signals.find((s) => s.id === 'steam')!.strength === 0);

console.log('\n— scenario: line stuck, juice walking (PHI) —');
const phi = byName('Philadelphia');
const juice = phi.spread.signals.find((s) => s.id === 'juiceMove')!;
check('juice signal fires', juice.strength > 0.2, `strength ${juice.strength.toFixed(2)}`);
check('posted line never moved', Math.abs(phi.spread.sharp.line - phi.spread.openLine) < 0.01);

console.log('\n— scenario: public drift, NOT sharp (MIA) —');
const mia = byName('Miami');
const rlm = mia.spread.signals.find((s) => s.id === 'reverseMove')!;
check('reverse-move signal stays silent', rlm.strength === 0);
check('line moved with the public, so score stays modest', mia.spread.score < 30, mia.spread.score.toFixed(1));

console.log('\n— scenario: quiet game (MIN) —');
const min = byName('Minnesota');
check('no clear edge', scoreBand(min.best.score).tone === 'noise', min.best.score.toFixed(1));

console.log('\n— scenario: under steam on the total (PIT) —');
const pit = byName('Pittsburgh');
check('total outranks the spread', pit.total.score > pit.spread.score);
check('sharp side is the under', pit.total.sharpSide === 'under');

console.log('\n— top of the board —');
for (const g of slate.slice(0, 6)) {
  const m = g.best;
  console.log(
    `  ${m.score.toFixed(0).padStart(3)}  ${g.awayTeam} @ ${g.homeTeam}` +
      `  [${m.market}] sharp: ${sideLabel(m.sharpSide, g)}` +
      `  vs public: ${sideLabel(m.squareSide, g)}`
  );
}

console.log('\n— point-in-time replay —');
{
  const snaps = oddsHistory.snapshots;
  const id = slate[0].id;
  const atOpen = readGameAt(snaps.slice(0, 1), id)!;
  const atNow = readGameAt(snaps, id)!;
  check('a one-snapshot read produces no movement signals',
    atOpen.spread.signals.filter((s) => s.id !== 'divergence').every((s) => s.strength === 0));
  check('a one-snapshot read reports partial coverage',
    atOpen.spread.coverage < atNow.spread.coverage,
    `${atOpen.spread.coverage} vs ${atNow.spread.coverage}`);
  check('full history matches the live board',
    Math.abs(atNow.spread.score - slate[0].spread.score) < 1e-9);
}

console.log('\n— closing line value —');
{
  const summary = summarize(clvArchive, STRONG_MIN);
  check('archive produced graded flags', summary.overall.n > 0, `n=${summary.overall.n}`);

  // The grading window must open strictly after the flag, or the engine would
  // be scored on the same movement that triggered it.
  const rows = summary.rows;
  check('every graded flag closed after it was flagged',
    rows.every((r) => {
      const reads = r.market.reads;
      return r.market.flaggedAt !== null &&
        r.market.flaggedAt < reads[reads.length - 1].takenAt;
    }));
  check('no flag is graded below the lean band',
    rows.every((r) => r.market.flaggedScore >= LEAN_MIN));

  // CLV must be the signed move toward the flagged side, not the raw move.
  check('CLV sign follows the flagged side',
    rows.every((r) => {
      const dir = r.market.flaggedSide === 'home' || r.market.flaggedSide === 'over' ? 1 : -1;
      const expected = dir * (r.market.closingMu - (r.market.flaggedMu as number));
      return Math.abs(expected - (r.market.clv as number)) < 1e-9;
    }));

  // A fixture that grades near-perfectly is a broken fixture, not a good model.
  check('sample beat rate is not implausibly high',
    summary.overall.beatRate < 0.85,
    `${(summary.overall.beatRate * 100).toFixed(0)}%`);
  check('buckets sum to the overall count',
    summary.byMarket.reduce((n, b) => n + b.n, 0) === summary.overall.n);
  check('strength buckets also sum to the overall count',
    summary.byBand.reduce((n, b) => n + b.n, 0) === summary.overall.n);

  // Entry is recorded at the first crossing of the lean band, so it always sits
  // near that threshold; peak is what the read actually reached. If these were
  // the same the strength split would be meaningless.
  check('peak is never below the entry score',
    rows.every((r) => r.peak >= r.market.flaggedScore - 1e-9));
  check('at least one read peaked above its entry score',
    rows.some((r) => r.peak > r.market.flaggedScore + 1e-9),
    `max gap ${Math.max(...rows.map((r) => r.peak - r.market.flaggedScore)).toFixed(1)}`);

  console.log(`  record: ${summary.overall.n} flags, mean CLV ` +
    `${summary.overall.meanClv.toFixed(2)}, beat ${(summary.overall.beatRate * 100).toFixed(0)}%`);
}

console.log('\n— movement is never measured across a coverage gap —');
{
  // Sharp books drop look-ahead lines and requote days later at a different
  // number. Treating that as continuous movement invented a 6.2-point move on
  // a real Week 4 game and pushed its score from ~37 to 62.
  const KICK = '2026-10-05T17:00:00Z';
  const withSharp = (takenAt: string, homePoint: number): Snapshot => ({
    takenAt,
    games: [{
      id: 'g2', commenceTime: KICK, homeTeam: 'Home Team', awayTeam: 'Away Team',
      books: [
        { book: 'pinnacle', spread: { homePoint, homePrice: -105, awayPoint: -homePoint, awayPrice: -105 },
          total: { point: 45, overPrice: -105, underPrice: -105 } },
        { book: 'draftkings', spread: { homePoint, homePrice: -110, awayPoint: -homePoint, awayPrice: -110 },
          total: { point: 45, overPrice: -110, underPrice: -110 } },
      ],
    }],
  });
  // Retail only — sharp coverage has lapsed for this poll.
  const retailOnly = (takenAt: string, homePoint: number): Snapshot => ({
    takenAt,
    games: [{
      id: 'g2', commenceTime: KICK, homeTeam: 'Home Team', awayTeam: 'Away Team',
      books: [
        { book: 'draftkings', spread: { homePoint, homePrice: -110, awayPoint: -homePoint, awayPrice: -110 },
          total: { point: 45, overPrice: -110, underPrice: -110 } },
      ],
    }],
  });

  const hist = [
    withSharp('2026-10-01T12:00:00Z', 2.5),   // early look-ahead, then dropped
    retailOnly('2026-10-02T12:00:00Z', 2.5),
    retailOnly('2026-10-03T12:00:00Z', 2.5),
    withSharp('2026-10-04T12:00:00Z', -3),    // requotes 5.5 pts away
    withSharp('2026-10-04T18:00:00Z', -3),
  ];
  const read = readGameAt(hist, 'g2')!;
  check('baseline restarts after the gap, not at first sighting',
    Math.abs(read.spread.openLine - -3) < 1e-9, `openLine ${read.spread.openLine}`);
  check('no phantom movement is reported across the lapse',
    Math.abs(read.spread.moveMu) < 0.01, `moveMu ${read.spread.moveMu.toFixed(2)}`);
  check('reverse line movement stays silent',
    read.spread.signals.find((s) => s.id === 'reverseMove')!.strength === 0);
  // Steam bridged gaps too: the baseline fix alone left it comparing prices
  // either side of a lapse and calling the difference one violent move.
  check('steam does not fire across the lapse either',
    read.spread.signals.find((s) => s.id === 'steam')!.strength === 0,
    `strength ${read.spread.signals.find((s) => s.id === 'steam')!.strength.toFixed(2)}`);
}

console.log('\n— in-play prices must not become the close —');
{
  // Hand-built history: a sane number before kickoff, then a wild in-play
  // number after it. The feed really does keep returning prices once a game is
  // under way, and grading against one would corrupt the whole week silently.
  const KICK = '2026-09-20T17:00:00Z';
  const snap = (takenAt: string, homePoint: number): Snapshot => ({
    takenAt,
    games: [{
      id: 'g1',
      commenceTime: KICK,
      homeTeam: 'Home Team',
      awayTeam: 'Away Team',
      books: [
        { book: 'pinnacle', spread: { homePoint, homePrice: -105, awayPoint: -homePoint, awayPrice: -105 },
          total: { point: 45, overPrice: -105, underPrice: -105 } },
        { book: 'circasports', spread: { homePoint, homePrice: -105, awayPoint: -homePoint, awayPrice: -105 },
          total: { point: 45, overPrice: -105, underPrice: -105 } },
        { book: 'draftkings', spread: { homePoint: homePoint + 1, homePrice: -110, awayPoint: -homePoint - 1, awayPrice: -110 },
          total: { point: 45.5, overPrice: -110, underPrice: -110 } },
        { book: 'fanduel', spread: { homePoint: homePoint + 1, homePrice: -110, awayPoint: -homePoint - 1, awayPrice: -110 },
          total: { point: 45.5, overPrice: -110, underPrice: -110 } },
      ],
    }],
  });

  const history = [
    snap('2026-09-20T12:00:00Z', -3),
    snap('2026-09-20T16:50:00Z', -3.5),   // last bettable number
    snap('2026-09-20T18:30:00Z', -21),    // in-play blowout price
  ];

  const resolved = resolveGame(history, 'g1')!;
  check('closing line is the last PRE-kickoff number',
    Math.abs(resolved.spread.closingLine - -3.5) < 1e-9,
    `got ${resolved.spread.closingLine}`);
  check('the in-play snapshot is still kept in the record',
    resolved.spread.reads.length === 3);
  check('an in-play price never becomes the close',
    resolved.spread.closingLine !== -21);

  // A game only ever seen after kickoff has no bettable price at all, so the
  // engine declines to read it rather than reporting an in-play number.
  const lateOnly = resolveGame([snap('2026-09-20T18:30:00Z', -21)], 'g1');
  check('a game seen only in-play produces no read at all', lateOnly === null);
}

console.log('\n— key numbers and pushes —');
{
  const on3 = spreadOutcomeAt(3, -3);
  const on7 = spreadOutcomeAt(7, -7);
  const off = spreadOutcomeAt(3, -3.5);
  check('a game expected by 3 lands on exactly 3 about 8% of the time',
    on3.push > 0.07 && on3.push < 0.1, `${(on3.push * 100).toFixed(1)}%`);
  check('7 is the second key number', on7.push > 0.04 && on7.push < on3.push,
    `${(on7.push * 100).toFixed(1)}%`);
  check('a half-point line can never push', off.push === 0);
  check('outcome probabilities sum to one',
    Math.abs(on3.win + on3.push + on3.lose - 1) < 1e-9);

  // The case that exposed the push-blind model: -3 (-125) and -3.5 (-110) are
  // close to the same bet. A bell curve with no pushes put them 0.84 apart,
  // which the engine then scored as a big sharp/public divergence.
  const a = impliedMargin({ homePoint: -3, homePrice: -125, awayPoint: 3, awayPrice: 110 });
  const b = impliedMargin({ homePoint: -3.5, homePrice: -110, awayPoint: 3.5, awayPrice: -110 });
  check('-3 (-125/+110) and -3.5 (-110) read as nearly the same number',
    Math.abs(a - b) < 0.3, `${a.toFixed(2)} vs ${b.toFixed(2)}`);
}

console.log('\n— what to bet —');
{
  check('-110 at a coin flip loses about $4.55 per $100',
    Math.abs(evPer100({ win: 0.5, push: 0, lose: 0.5 }, -110) + 4.545) < 0.01);
  check('a push refunds the stake — no EV either way',
    Math.abs(evPer100({ win: 0.46, push: 0.08, lose: 0.46 }, 100)) < 1e-9);

  const latest = oddsHistory.snapshots[oddsHistory.snapshots.length - 1];
  const reads = readSlate(oddsHistory);
  const recs = reads.map((r) => ({ r, rec: recommend(r, findGame(latest.games, r.id), ['draftkings']) }));
  check('no books picked means no bets', reads.every((r) =>
    recommend(r, findGame(latest.games, r.id), []).verdict === 'pass'));
  check('every recommendation takes the best option on offer', recs.every(({ rec }) =>
    rec.options.every((o) => !rec.best || o.ev <= rec.best.ev + 1e-9)));
  check('only the selected books are ever recommended', recs.every(({ rec }) =>
    rec.options.every((o) => o.book === 'draftkings')));
  check('a bet always clears the EV bar', recs.every(({ rec }) =>
    rec.verdict !== 'bet' || rec.best!.ev >= BET_MIN_EV));

  // Build one game where a single operator's two brands disagree with retail by
  // a mile. BetOnline and LowVig are one company: that is one opinion, not a
  // consensus, and it must not produce a bet however large the gap.
  const q = (book: string, homePoint: number, homePrice: number, awayPrice: number): BookQuote => ({
    book,
    spread: { homePoint, homePrice, awayPoint: -homePoint, awayPrice },
  });
  const game = (books: BookQuote[]): GameQuote => ({
    id: 'edge', commenceTime: '2026-09-20T17:00:00Z', homeTeam: 'Home Hawks', awayTeam: 'Away Owls', books,
  });
  const readOf = (g: GameQuote): GameRead => readGameAt([{ takenAt: '2026-09-18T12:00:00Z', games: [g] }], 'edge')!;
  const dk = q('draftkings', -3, -110, -110);

  const sisters = game([q('betonlineag', -6, -110, -110), q('lowvig', -6, -108, -108), dk]);
  const r1 = readOf(sisters);
  check('sister brands count as one sharp operator', r1.spread.sharp.count === 1);
  check('one operator alone never produces a bet',
    recommend(r1, sisters, ['draftkings']).verdict !== 'bet');

  const noMaker = game([q('betonlineag', -6, -110, -110), q('bookmaker', -6, -110, -110), dk]);
  const r2 = readOf(noMaker);
  const rec2 = recommend(r2, noMaker, ['draftkings']);
  check('without Pinnacle or Circa a big edge is capped at thin',
    rec2.verdict === 'thin' && rec2.best!.ev >= BET_MIN_EV, rec2.reason);

  const real = game([q('pinnacle', -6, -110, -110), q('bookmaker', -6, -110, -110), dk]);
  const rec3 = recommend(readOf(real), real, ['draftkings']);
  check('a market-maker-backed edge is a bet on the right side',
    rec3.verdict === 'bet' && rec3.best!.side === 'home' && rec3.best!.line === -3, rec3.reason);
}

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
