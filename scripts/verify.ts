// Sanity checks for the apron + trade engines. Run with: npx tsx scripts/verify.ts
import { TEAMS, getTeam } from '../src/data/teams';
import { CURRENT_SEASON } from '../src/data/leagueConstants';
import { summarizeTeamSeason } from '../src/lib/apron';
import { evaluateTrade } from '../src/lib/trade';
import { evaluateSigning } from '../src/lib/freeAgent';
import { money } from '../src/lib/format';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '  ok ' : 'FAIL '} ${name}`);
  if (!cond) failures++;
}

console.log('\n=== Team tiers (2025-26 focal season) ===');
for (const t of TEAMS) {
  const s = summarizeTeamSeason(t, CURRENT_SEASON);
  console.log(
    `${t.abbreviation.padEnd(4)} ${money(s.totalSalary).padStart(9)}  ${s.tier}`
  );
}

console.log('\n=== Expected tiers (2025-26) ===');
const expect: Record<string, string> = {
  BOS: 'secondApron',
  PHX: 'firstApron',
  OKC: 'underCap',
  UTA: 'underCap',
};
for (const [abbr, tier] of Object.entries(expect)) {
  const s = summarizeTeamSeason(getTeam(abbr), CURRENT_SEASON);
  check(`${abbr} is ${tier}`, s.tier === tier);
}

console.log('\n=== Trade engine ===');
// A second-apron team (BOS) aggregating two salaries to take back a bigger one
// must be blocked.
const bos = getTeam('BOS');
const uta = getTeam('UTA');
const bosTwo = bos.players.filter((p) =>
  ['Sam Hauser', 'Payton Pritchard'].includes(p.name)
);
const utaBig = uta.players.filter((p) => p.name === 'Lauri Markkanen');
const aggTrade = evaluateTrade(
  { team: bos, outgoingPlayerIds: bosTwo.map((p) => p.id) },
  { team: uta, outgoingPlayerIds: utaBig.map((p) => p.id) },
  CURRENT_SEASON
);
check(
  'BOS cannot aggregate over the second apron',
  !aggTrade.legal &&
    aggTrade.blockingViolations.some((v) => v.code === 'second-apron-aggregate')
);

// A clean, well-matched single-for-single swap between two cap-space teams is legal.
const okc = getTeam('OKC');
const okcP = okc.players.find((p) => p.name === 'Luguentz Dort')!;
const utaP = uta.players.find((p) => p.name === 'Collin Sexton')!;
const cleanTrade = evaluateTrade(
  { team: okc, outgoingPlayerIds: [okcP.id] },
  { team: uta, outgoingPlayerIds: [utaP.id] },
  CURRENT_SEASON
);
check('Matched cap-space swap is legal', cleanTrade.legal);

console.log('\n=== Free agent engine ===');
// Second-apron BOS cannot sign a $12.8M MLE player.
const faBos = evaluateSigning(bos, CURRENT_SEASON, 12_822_000);
check(
  'Second-apron BOS cannot use the MLE',
  !faBos.recommended || faBos.recommended.tool === 'minimum'
    ? faBos.violations.some((v) => v.code === 'no-tool')
    : false
);
check(
  'Under-cap UTA can sign a $20M FA with cap space',
  evaluateSigning(uta, CURRENT_SEASON, 20_000_000).recommended?.tool === 'capSpace'
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
