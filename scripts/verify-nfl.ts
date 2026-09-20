// Headless sanity checks for the sharp-money engine. Run:
//   npx tsx scripts/verify-nfl.ts
// The sample history in src/nfl/data is built so each scenario lights up a
// specific signal; these checks assert that it does.
import { oddsHistory } from '../src/nfl/data/oddsHistory';
import { readSlate, sideLabel, scoreBand } from '../src/nfl/lib/sharp';
import { impliedMargin, noVig } from '../src/nfl/lib/market';

let failures = 0;
const check = (name: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!pass) failures++;
};

console.log('\n— price plumbing —');
check('no-vig of -110/-110 is 0.500', Math.abs(noVig(-110, -110) - 0.5) < 1e-9);
check(
  'home -3 at even money implies mu = 3',
  Math.abs(impliedMargin({ homePoint: -3, homePrice: 100, awayPoint: 3, awayPrice: 100 }) - 3) < 0.01
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

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
