// Sanity checks for the apron + trade engines. Run with: npx tsx scripts/verify.ts
import { TEAMS, getTeam } from '../src/data/teams';
import { CURRENT_SEASON } from '../src/data/leagueConstants';
import { summarizeTeamSeason } from '../src/lib/apron';
import { evaluateTrade } from '../src/lib/trade';
import { evaluateSigning } from '../src/lib/freeAgent';
import { parseContractsCsv } from '../src/lib/importCsv';
import { money } from '../src/lib/format';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '  ok ' : 'FAIL '} ${name}`);
  if (!cond) failures++;
}

console.log('\n=== Team tiers (2026-27 focal season) ===');
for (const t of TEAMS) {
  const s = summarizeTeamSeason(t, CURRENT_SEASON);
  console.log(
    `${t.abbreviation.padEnd(4)} ${money(s.totalSalary).padStart(9)}  ${s.tier}`
  );
}

console.log('\n=== Expected tiers (2026-27) ===');
const expect: Record<string, string> = {
  BOS: 'secondApron',
  PHX: 'firstApron',
  DEN: 'overTax',
  NYK: 'overCap',
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

console.log('\n=== CSV importer ===');
// Mimic a Basketball-Reference "Get table as CSV" paste, including the
// thousands-commas inside dollar amounts that must be handled.
const sampleCsv = [
  'Player,2025-26,2026-27,2027-28,Guaranteed',
  'Jayson Tatum,"$54,126,450","$58,456,566","$62,786,682","$175,369,698"',
  'Sam Hauser,$10,000,000,$10,800,000,,"$20,800,000"',
  'Team Totals,"$64,126,450",,,',
].join('\n');
const parsed = parseContractsCsv(sampleCsv);
check('parses two players (skips totals row)', parsed.players.length === 2);
check(
  'reads Tatum 2025-26 salary through thousands-commas',
  parsed.players[0]?.contract.find((c) => c.season === 2025)?.salary === 54_126_450
);
check(
  'leaves an empty cell unsigned',
  parsed.players[1]?.contract.find((c) => c.season === 2027) === undefined
);
check('detects seasons 2025-2027', parsed.seasons.join(',') === '2025,2026,2027');

// A SalarySwish-style paste: tab-separated, with Pos/Age columns and $X.XM values.
const swishTsv = [
  'Player\tPos\tAge\t2026-27\t2027-28',
  'Jayson Tatum\tSF\t28\t$58.5M\t$62.8M',
  'Sam Hauser\tSF\t29\t$11.6M\t—',
].join('\n');
const swish = parseContractsCsv(swishTsv);
check('parses tab-separated SalarySwish-style paste', swish.players.length === 2);
check(
  'reads $58.5M as 58,500,000',
  swish.players[0]?.contract.find((c) => c.season === 2026)?.salary === 58_500_000
);
check('captures position and age', swish.players[0]?.position === 'SF' && swish.players[0]?.age === 28);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
