// Sanity checks for the apron + trade engines. Run with: npx tsx scripts/verify.ts
import { TEAMS, getTeam } from '../src/data/teams';
import { CURRENT_SEASON } from '../src/data/leagueConstants';
import { summarizeTeamSeason, rosterFillProjection } from '../src/lib/apron';
import { evaluateTrade } from '../src/lib/trade';
import { evaluateSigning } from '../src/lib/freeAgent';
import { parseContractsCsv } from '../src/lib/importCsv';
import { computeTax } from '../src/lib/luxuryTax';
import { freeAgentQuiver } from '../src/lib/freeAgentQuiver';
import { setSignings, usedExceptionsFor } from '../src/lib/signingsStore';
import { setTradeExceptions, tradeExceptionsFor } from '../src/lib/tradeExceptionsStore';
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

console.log('\n=== Expected tiers (2026-27, real SalarySwish data) ===');
const expect: Record<string, string> = {
  DEN: 'secondApron',
  OKC: 'firstApron',
  NYK: 'firstApron',
  ORL: 'overTax',
  LAL: 'overCap',
  BKN: 'underCap',
};
for (const [abbr, tier] of Object.entries(expect)) {
  const s = summarizeTeamSeason(getTeam(abbr), CURRENT_SEASON);
  check(`${abbr} is ${tier}`, s.tier === tier);
}

const bySalary = (players: (typeof den)['players']) =>
  [...players].sort(
    (a, b) =>
      (a.contract.find((c) => c.season === CURRENT_SEASON)?.salary ?? 0) -
      (b.contract.find((c) => c.season === CURRENT_SEASON)?.salary ?? 0)
  );

console.log('\n=== Trade engine ===');
// A second-apron team (DEN) cannot aggregate two salaries — send its two
// cheapest for a cap-space team's priciest.
const den = getTeam('DEN');
const uta = getTeam('UTA');
const aggTrade = evaluateTrade(
  { team: den, outgoingPlayerIds: bySalary(den.players).slice(0, 2).map((p) => p.id) },
  { team: uta, outgoingPlayerIds: bySalary(uta.players).slice(-1).map((p) => p.id) },
  CURRENT_SEASON
);
check(
  'DEN cannot aggregate over the second apron',
  !aggTrade.legal &&
    aggTrade.blockingViolations.some((v) => v.code === 'second-apron-aggregate')
);

// A minimal swap of two cap-space teams' cheapest players is legal.
const bkn = getTeam('BKN');
const cleanTrade = evaluateTrade(
  { team: bkn, outgoingPlayerIds: [bySalary(bkn.players)[0].id] },
  { team: uta, outgoingPlayerIds: [bySalary(uta.players)[0].id] },
  CURRENT_SEASON
);
check('Matched cap-space swap is legal', cleanTrade.legal);

// A second-apron team (DEN) cannot include its frozen first-round pick
// (seven drafts out) in a trade.
const frozenYear = CURRENT_SEASON + 7;
const denFrozenPick = den.draftCapital.find(
  (p) => p.round === 1 && p.year === frozenYear && p.originalTeam === 'DEN'
);
if (!denFrozenPick) throw new Error('expected DEN to control its own frozen-year 1st');
const frozenPickTrade = evaluateTrade(
  {
    team: den,
    outgoingPlayerIds: [bySalary(den.players).slice(-1)[0].id],
    outgoingPicks: [denFrozenPick],
  },
  { team: uta, outgoingPlayerIds: [bySalary(uta.players).slice(-1)[0].id] },
  CURRENT_SEASON
);
check(
  'DEN cannot trade its frozen first-round pick',
  !frozenPickTrade.legal &&
    frozenPickTrade.blockingViolations.some((v) => v.code === 'frozen-pick')
);
// A non-frozen pick from the same team is fine to include.
const denOkPick = den.draftCapital.find(
  (p) => p.round === 1 && p.year === CURRENT_SEASON && p.originalTeam === 'DEN'
);
if (denOkPick) {
  const okPickTrade = evaluateTrade(
    {
      team: uta,
      outgoingPlayerIds: [bySalary(uta.players).slice(-1)[0].id],
    },
    {
      team: den,
      outgoingPlayerIds: [bySalary(den.players).slice(-1)[0].id],
      outgoingPicks: [denOkPick],
    },
    CURRENT_SEASON
  );
  check(
    'DEN can include a near-term first-round pick',
    !okPickTrade.blockingViolations.some((v) => v.code === 'frozen-pick')
  );
}

console.log('\n=== Trade exceptions in the machine ===');
const lal = getTeam('LAL');
const utaCheapest = bySalary(uta.players).find(
  (p) => (p.contract.find((c) => c.season === CURRENT_SEASON)?.salary ?? 0) > 0
)!;
const lalSide = { team: lal, outgoingPlayerIds: [] as string[] };
const lalOther = { team: uta, outgoingPlayerIds: [utaCheapest.id] };
const noTpe = evaluateTrade(lalSide, lalOther, CURRENT_SEASON).teams[0];
const withTpe = evaluateTrade(
  { ...lalSide, tpe: { player: 'Test TPE', remaining: 10_000_000, expired: false, priorYear: false } },
  lalOther,
  CURRENT_SEASON
).teams[0];
check(
  'a valid TPE adds absorb capacity to max legal incoming',
  withTpe.tpeCapacity === 10_000_000 &&
    withTpe.maxAllowedIncoming - noTpe.maxAllowedIncoming === 10_000_000
);

const expiredTpe = evaluateTrade(
  { ...lalSide, tpe: { player: 'Old TPE', remaining: 10_000_000, expired: true, priorYear: false } },
  lalOther,
  CURRENT_SEASON
);
check(
  'an expired TPE is blocked',
  expiredTpe.blockingViolations.some((v) => v.code === 'tpe-expired')
);

const denPriorTpe = evaluateTrade(
  {
    team: den,
    outgoingPlayerIds: [bySalary(den.players).slice(-1)[0].id],
    tpe: { player: 'Prior TPE', remaining: 5_000_000, expired: false, priorYear: true },
  },
  { team: uta, outgoingPlayerIds: [bySalary(uta.players).slice(-1)[0].id] },
  CURRENT_SEASON
);
check(
  'second-apron team cannot use a prior-year TPE',
  denPriorTpe.blockingViolations.some((v) => v.code === 'tpe-second-apron')
);

console.log('\n=== Free agent engine ===');
// Second-apron DEN cannot sign a $12.8M MLE player.
const faDen = evaluateSigning(den, CURRENT_SEASON, 12_822_000);
check(
  'Second-apron DEN cannot use the MLE',
  faDen.violations.some((v) => v.code === 'no-tool')
);
check(
  'Under-cap UTA can sign a $20M FA with cap space',
  evaluateSigning(uta, CURRENT_SEASON, 20_000_000).recommended?.tool === 'capSpace'
);

console.log('\n=== Luxury tax (SalarySwish 2026-27 schedule) ===');
const TAX = 200_000_000;
check('under the tax line → $0 bill', computeTax(TAX - 5_000_000, TAX).bill === 0);
// $10M over: bracket 1 = $6.064M @ 1.00× ($6,064,000) + $3.936M @ 1.25× ($4,920,000) = $10,984,000.
check(
  '$10M over → $10.984M bill (standard)',
  computeTax(TAX + 10_000_000, TAX).bill === 10_984_000
);
// Reproduces SalarySwish exactly: BOS repeater, $44,226 over → $44,226 × 3.00 = $132,678.
check(
  'repeater bracket-1 reproduces SalarySwish (BOS $44,226 → $132,678)',
  computeTax(TAX + 44_226, TAX, true).bill === 132_678
);
const denTax = computeTax(getTeam('DEN').players.reduce((s, p) => s + (p.contract.find((c) => c.season === CURRENT_SEASON)?.salary ?? 0), 0), 200_428_000);
check('Denver (2nd apron) owes a large tax bill (> $80M)', denTax.bill > 80_000_000);
console.log(`  Denver estimated tax bill: ${money(denTax.bill)} (marginal ${denTax.marginalRate}x)`);
check(
  'repeater rates cost more than standard',
  computeTax(TAX + 20_000_000, TAX, true).bill > computeTax(TAX + 20_000_000, TAX, false).bill
);

console.log('\n=== Free Agent Quiver ===');
const denQuiver = freeAgentQuiver(getTeam('DEN'), CURRENT_SEASON);
check(
  'second-apron team has no MLE arrow available',
  denQuiver.every((a) => !(a.key.includes('mle') && a.status === 'available'))
);
const bknQuiver = freeAgentQuiver(getTeam('BKN'), CURRENT_SEASON);
check(
  'cap-space team has Cap Space available',
  bknQuiver.some((a) => a.key === 'cap' && a.status === 'available')
);

// Signings cross-check: an MLE usage from the transactions list flips the
// team's MLE arrow to "used".
const gswBase = freeAgentQuiver(getTeam('GSW'), CURRENT_SEASON);
const gswUsed = freeAgentQuiver(getTeam('GSW'), CURRENT_SEASON, [
  { family: 'mle' as const, method: 'MLE', player: 'Melton' },
]);
check(
  'MLE arrow is available before the signings cross-check',
  gswBase.find((a) => a.key === 'ntmle')?.status === 'available'
);
check(
  'MLE arrow flips to "used" from a transactions entry',
  gswUsed.find((a) => a.key === 'ntmle')?.status === 'used'
);

console.log('\n=== Seeded league defaults (bundled) ===');
check(
  'seeded signings load by default (GSW spent its MLE)',
  usedExceptionsFor('GSW').some((u) => u.family === 'mle')
);
check(
  'seeded signings load by default (LAL spent its MLE)',
  usedExceptionsFor('LAL').some((u) => u.family === 'mle')
);
check('seeded TPEs load by default (ATL has exceptions)', tradeExceptionsFor('ATL').length > 0);
check('seeded TPEs load by default (BOS has exceptions)', tradeExceptionsFor('BOS').length > 0);

console.log('\n=== Transactions & TPE parsers ===');
const txn = [
  'PLAYER\tAGE\tPOS\tTEAM\tDATE\tTYPE\tMETHOD',
  'Melton\t28\tPG\tLogo of the Golden State WarriorsGSW\tJul 1, 2026\tVeteran Contract\tMLE',
  'Landale\t30\tC\tLogo of the Atlanta HawksATL\tJun 30, 2026\tVeteran Contract\tTaxpayer-MLE',
  'Robinson\t28\tC\tLogo of the Boston CelticsBOS\tJul 1, 2026\tVeteran Contract\tBird Exception',
].join('\n');
setSignings(txn);
check('signings: GSW MLE tracked', usedExceptionsFor('GSW').some((u) => u.family === 'mle'));
check('signings: ATL taxpayer MLE tracked', usedExceptionsFor('ATL').some((u) => u.family === 'mle'));
check('signings: Bird re-signing ignored', usedExceptionsFor('BOS').length === 0);

const tpeSample = [
  'TEAM\tPLAYER\tEXCEPTION\tUSED\tREMAINING\tSTART DATE\tEND DATE',
  'Logo of the Denver NuggetsDEN\tMichael Porter Jr.\t$17,275,985\t$10,395,000 Tooltip\t$6,880,985\tJul 8, 2025\tJul 8, 2026',
].join('\n');
setTradeExceptions(tpeSample);
check('TPE: DEN remaining parsed', tradeExceptionsFor('DEN')[0]?.remaining === 6_880_985);

console.log('\n=== Roster fill projection ===');
const denFill = rosterFillProjection(getTeam('DEN'), CURRENT_SEASON);
const denNow = summarizeTeamSeason(getTeam('DEN'), CURRENT_SEASON).totalSalary;
check('incomplete roster adds minimum-fill cost', denFill.open > 0 && denFill.projectedTotal > denNow);
console.log(`  DEN: ${denFill.count} signed, ${denFill.open} to fill -> projected ${money(denFill.projectedTotal)}`);

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

// The real SalarySwish copy format: rows wrap across lines (P/T badges, Bird
// rights, UFA/RFA each on their own line). Uses the actual Knicks paste.
const swishWrapped = [
  'ACTIVE (11 - $210,638,759)\tSTATUS\tACQUIRED\tAGE\tPOS\tTERMS\t2026-27\t2027-28\t2028-29\t2029-30\t2030-31\t2031-32',
  'Towns, Karl-Anthony\tActive List\tTrade\t30\tPF, C\tMax\t$57,078,728\t',
  'P', '$61,015,192', 'Bird', 'UFA',
  'Anunoby, OG\tActive List\tSigned\t28\tSF\t\t$42,500,000\t$45,431,034\t',
  'P', '$48,362,068', 'Bird', 'UFA',
  'Brunson, Jalen\tActive List\tSigned\t29\tPG\t\t$37,739,521\t$40,535,041\t',
  'P', '$43,330,561', 'Bird', 'UFA',
  'Bridges, Mikal\tActive List\tTrade\t29\tSG, SF\t\t$33,482,145\t$36,160,714\t$38,839,285\t',
  'P', '$41,517,856', 'Bird', 'UFA',
  'Hart, Josh\tActive List\tTrade\t31\tSF, SG\t\t$20,923,760\t',
  'T', '$22,375,280', 'Bird', 'UFA',
  'Shamet, Landry\tActive List\tSigned\t29\tSG\tUnconfirmed Information\t$5,357,143\t$5,785,714\t$6,214,286\t$6,642,857\t',
  'Bird', 'UFA',
  'Alvarado, Jose\tActive List\tTrade\t28\tPG\tUnconfirmed Information\t$4,320,988\t$4,666,667\t$5,012,346\t',
  'Bird', 'UFA',
  'McBride, Miles\tActive List\tDraft\t25\tPG\t\t$3,956,523\t',
  'Bird', 'UFA',
  'Dadiet, Pacôme\tActive List\tDraft\t20\tPF\tRSCLikely Incentive\t',
  'T', '$2,983,680', 'T', '$5,373,608', 'Bird', 'RFA',
  'Kolek, Tyler\tActive List\tDraft\t25\tPG\t\t$2,296,271\t',
  'T', '$2,486,995', 'Bird', 'RFA',
  'Diawara, Mohamed\tActive List\tDraft\t21\tPF, SF\tUnconfirmed Information\t',
  'Non-Bird', 'RFA',
].join('\n');
const nyk = parseContractsCsv(swishWrapped);
const total2627 = nyk.players.reduce(
  (s, p) => s + (p.contract.find((c) => c.season === 2026)?.salary ?? 0),
  0
);
check('parses 10 players (skips salary-less Diawara)', nyk.players.length === 10);
check(
  'reconstructs 2026-27 total = $210,638,759 (matches SalarySwish)',
  total2627 === 210_638_759
);
const towns = nyk.players.find((p) => p.name === 'Karl-Anthony Towns');
check('reformats "Last, First" to "First Last"', Boolean(towns));
check(
  'reads Towns 2027-28 as a player option',
  towns?.contract.find((c) => c.season === 2027)?.option === 'player'
);
check(
  'reads Hart 2027-28 as a team option',
  nyk.players.find((p) => p.name === 'Josh Hart')?.contract.find((c) => c.season === 2027)
    ?.option === 'team'
);
check(
  'captures Towns position (PF, C) and age 30',
  towns?.position === 'PF, C' && towns?.age === 30
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
process.exit(failures === 0 ? 0 : 1);
