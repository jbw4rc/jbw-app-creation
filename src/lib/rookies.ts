import type { Player } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Rookie projections.
//
// First-year players have no NBA history, so DARKO carries no DPM or minutes for
// them and they'd otherwise show 0 value and 0 minutes. We fill that gap with an
// expectation grounded in draft slot:
//
//  • Draft slot is inferred from the rookie-scale SALARY, which is set by pick
//    number (monotonic: the #1 pick earns the most, #30 the least). First-round
//    rookies are flagged `signedUsing === 'RSC'`.
//  • Minutes: high picks play big developmental minutes; late firsts get spot
//    minutes. (Real first-round rookie MPG by slot: top-3 ~27, 4-9 ~22, 10-14
//    ~16, 15-22 ~12, 23-30 ~8.) We only project FIRST-round picks — second-round
//    and undrafted rookies rarely earn rotation minutes and stay at 0.
//  • Value: rookies are almost always BELOW replacement in year one — a real
//    short-term drag that scales with slot. This is the current-season
//    expectation; the aging curve handles the upside in later years.
// ---------------------------------------------------------------------------

export interface RookieProjection {
  dpm: number;
  min: number; // projected minutes per game
  label: string; // e.g. "Lottery rookie", "2nd-round rookie"
  firstRound: boolean;
}

// Salary ($M) → [minutes, dpm, label] for a first-round (rookie-scale) rookie.
// Thresholds track the 2026-27 rookie scale (~120% of scale) by pick tier.
function firstRoundBand(salM: number): { min: number; dpm: number; label: string } {
  if (salM >= 11) return { min: 27, dpm: -1.2, label: 'Top-3 rookie' };
  if (salM >= 8) return { min: 23, dpm: -1.8, label: 'High-lottery rookie' };
  if (salM >= 6) return { min: 19, dpm: -2.2, label: 'Lottery rookie' };
  if (salM >= 4.5) return { min: 15, dpm: -2.6, label: 'Mid-first rookie' };
  if (salM >= 3.5) return { min: 11, dpm: -3.0, label: 'Late-first rookie' };
  return { min: 8, dpm: -3.3, label: 'Late-first rookie' };
}

/**
 * A projection for a rookie who has no DARKO data, else null. Returns null for
 * anyone DARKO already covers (they have NBA history) and for non-rookies.
 */
export function rookieInfo(p: Player): RookieProjection | null {
  if (darkoFor(p.name)) return null; // has NBA history — use DARKO, not this
  const cy = p.contract.find((c) => c.season === CURRENT_SEASON);
  const salM = cy && cy.salary > 0 ? cy.salary / 1e6 : 0;
  if (salM <= 0) return null;

  // Only project first-round rookies (rookie-scale / RSC contracts). Second-round
  // and undrafted rookies rarely earn rotation minutes — some barely get signed —
  // so we leave them at 0 / replacement rather than inventing playing time.
  if (p.signedUsing === 'RSC') {
    const b = firstRoundBand(salM);
    return { ...b, firstRound: true };
  }
  return null;
}

/** DPM for a player, preferring DARKO and falling back to the rookie model. */
export function projectedDpm(p: Player): number | null {
  const d = darkoFor(p.name);
  if (d?.dpm != null) return d.dpm;
  return rookieInfo(p)?.dpm ?? null;
}

/** Projected minutes for a player (DARKO, else rookie model, else 0). */
export function projectedMinutes(p: Player): number {
  const d = darkoFor(p.name);
  if (d?.min != null) return d.min;
  return rookieInfo(p)?.min ?? 0;
}
