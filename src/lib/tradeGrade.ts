import type { DraftPick, Player } from '../types';
import type { TeamTradeResult } from './trade';
import { darkoFor } from './darko';
import { valuePick } from './draftValue';

// ---------------------------------------------------------------------------
// Trade grading.
//
// Scores each side of a trade in one currency: DARKO market value ($M). Players
// contribute their DARKO value; picks contribute their projected value (see
// draftValue.ts); cash counts at face. A side's net = value in - value out.
// DPM swing is carried alongside as a talent-quality read.
//
// Grades are per-team and roughly zero-sum: a lopsided deal grades one side up
// and the other down. "Fair" deals land near C for both.
// ---------------------------------------------------------------------------

export interface AssetValue {
  label: string;
  /** $M. */
  value: number;
  kind: 'player' | 'pick' | 'cash';
  /** DARKO DPM for players (undefined otherwise / if unmatched). */
  dpm?: number;
  /** True when a player has no DARKO match, so value is a floor. */
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
  return {
    label: p.name,
    value: d?.value ?? 0,
    kind: 'player',
    dpm: d?.dpm ?? undefined,
    unmatched: d?.value == null,
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

// Letter grade from a side's net value ($M). Symmetric around an even band so a
// clearly one-sided deal reads A/F while a balanced one reads B-/C+.
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
