import type { DraftPick, Player } from '../types';
import type { TeamTradeResult } from './trade';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { playerSalaryForSeason } from './apron';
import { darkoFor } from './darko';
import { valuePick } from './draftValue';

// ---------------------------------------------------------------------------
// Trade grading.
//
// Scores each side of a trade in one currency: SURPLUS value ($M). A player is
// worth his DARKO market value MINUS his cap hit — a $20M-value player on a
// $50M deal is a -$30M asset, the same value on a $5M deal is +$15M. Picks
// contribute their projected value (already a surplus over the rookie deal);
// cash counts at face against the sender. A side's net = surplus in - out.
//
// Because a salary-matched trade nets ~0 in salary, this reduces to a value
// comparison for even deals but also correctly rewards uneven ones (dumping a
// bad contract, absorbing salary into cap space / a TPE). DPM swing is carried
// alongside as a talent-quality read. Grades are per-team.
// ---------------------------------------------------------------------------

export interface AssetValue {
  label: string;
  /** Net surplus contribution, $M (DARKO value - cap hit for players). */
  value: number;
  kind: 'player' | 'pick' | 'cash';
  /** DARKO market value, $M (players only). */
  grossValue?: number;
  /** Cap hit / actual salary, $M (players only). */
  salary?: number;
  /** DARKO DPM for players (undefined otherwise / if unmatched). */
  dpm?: number;
  /** True when a player has no DARKO match, so surplus is unknown (treated 0). */
  unmatched?: boolean;
  note?: string;
}

export interface SideGrade {
  teamAbbr: string;
  assetsIn: AssetValue[];
  assetsOut: AssetValue[];
  valueIn: number;
  valueOut: number;
  /** valueIn - valueOut, in $M. */
  netValue: number;
  /** DPM added minus DPM sent out (talent swing). */
  netDpm: number;
  grade: string;
  /** True if any traded player lacked a DARKO value (grade is approximate). */
  approximate: boolean;
}

export interface TradeGrade {
  sides: SideGrade[];
  /** Fair when both sides land within the "even" band. */
  balanced: boolean;
}

function playerAsset(p: Player): AssetValue {
  const d = darkoFor(p.name);
  const salary = playerSalaryForSeason(p, CURRENT_SEASON) / 1_000_000;
  const gross = d?.value ?? null;
  // Surplus = market value - cap hit. Unknown value -> neutral 0 (flagged),
  // rather than tanking the player by his full salary on missing data.
  const surplus = gross == null ? 0 : gross - salary;
  return {
    label: p.name,
    value: surplus,
    kind: 'player',
    grossValue: gross ?? undefined,
    salary,
    dpm: d?.dpm ?? undefined,
    unmatched: gross == null,
  };
}

function pickAsset(pk: DraftPick, ownerAbbr: string): AssetValue {
  const v = valuePick(pk);
  const via = pk.originalTeam !== ownerAbbr ? ` (${pk.originalTeam})` : '';
  return {
    label: `${pk.year} ${pk.round === 1 ? '1st' : '2nd'}${via}`,
    value: v.value,
    kind: 'pick',
    note: v.note,
  };
}

// Letter grade from a side's net surplus ($M). Symmetric around an even band so
// a clearly one-sided deal reads A/F while a balanced one reads B-/C+.
function letter(net: number): string {
  if (net >= 15) return 'A+';
  if (net >= 9) return 'A';
  if (net >= 5) return 'B+';
  if (net >= 2) return 'B';
  if (net > -2) return 'C';
  if (net > -5) return 'C-';
  if (net > -9) return 'D';
  if (net > -15) return 'D-';
  return 'F';
}

function gradeSide(result: TeamTradeResult): SideGrade {
  const assetsIn: AssetValue[] = [
    ...result.incomingPlayers.map(playerAsset),
    ...result.incomingPicks.map((pk) => pickAsset(pk, result.teamAbbr)),
  ];
  const assetsOut: AssetValue[] = [
    ...result.outgoingPlayers.map(playerAsset),
    ...result.outgoingPicks.map((pk) => pickAsset(pk, result.teamAbbr)),
  ];
  // Cash: value out for the sender, value in for the receiver (face, in $M).
  if (result.cashSent > 0) {
    assetsOut.push({ label: 'Cash', value: result.cashSent / 1_000_000, kind: 'cash' });
  }

  const sum = (xs: AssetValue[]) => xs.reduce((s, a) => s + a.value, 0);
  const dpmSum = (xs: AssetValue[]) => xs.reduce((s, a) => s + (a.dpm ?? 0), 0);

  const valueIn = sum(assetsIn);
  const valueOut = sum(assetsOut);
  const netValue = valueIn - valueOut;
  const approximate = [...assetsIn, ...assetsOut].some((a) => a.unmatched);

  return {
    teamAbbr: result.teamAbbr,
    assetsIn,
    assetsOut,
    valueIn,
    valueOut,
    netValue,
    netDpm: dpmSum(assetsIn) - dpmSum(assetsOut),
    grade: letter(netValue),
    approximate,
  };
}

/** Grade every side of an evaluated trade. */
export function gradeTrade(results: TeamTradeResult[]): TradeGrade {
  const sides = results.map(gradeSide);
  const balanced = sides.every((s) => Math.abs(s.netValue) < 5);
  return { sides, balanced };
}
