import type { DraftPick } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { TEAMS } from '../data/teams';
import { SEEDED_WIN_TOTALS } from '../data/seededWinTotals';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Draft-pick valuation.
//
// The NBA can't use an NFL-style slot chart directly: picks trade years out, so
// you know the owning team, not the slot. This module turns "team X's pick in
// year Y" into an expected dollar value in the same $M currency as DARKO player
// value, so a trade grade can add players and picks in one unit.
//
// The chain is:  team -> projected finish -> expected draft slot -> $M value,
// with a horizon regression that pulls far-out picks toward a league-average
// slot (a 2032 pick from any team is close to a coin flip today).
//
// Finish is projected from Vegas win totals when the seed is populated (the
// market prices in offseason moves); otherwise it falls back to a DARKO
// team-strength ranking so the engine still differentiates teams today.
// ---------------------------------------------------------------------------

/** The draft that follows CURRENT_SEASON (2026-27 season -> 2027 draft). */
const NEXT_DRAFT_YEAR = CURRENT_SEASON + 1;

/** A pick with no team signal regresses toward a mid-first-round slot. */
const NEUTRAL_SLOT = 15;

// Base value curve: expected surplus value ($M) the player taken at a given
// slot produces over his rookie deal. Steep at the very top, flattening hard
// through the second round — the shape of published NBA pick-value work
// (Nylon Calculus / Pelton). Anchors are interpolated linearly between.
const VALUE_ANCHORS: [slot: number, value: number][] = [
  [1, 33],
  [2, 27],
  [3, 23],
  [4, 20],
  [5, 17.5],
  [6, 15.5],
  [7, 14],
  [8, 12.5],
  [9, 11.5],
  [10, 10.5],
  [12, 9],
  [14, 7.5],
  [16, 6.3],
  [18, 5.4],
  [20, 4.6],
  [25, 3.2],
  [30, 2.2],
  [35, 1.4],
  [40, 1.0],
  [45, 0.7],
  [50, 0.5],
  [55, 0.35],
  [60, 0.2],
];

/** Interpolated base value ($M) for a (possibly fractional) draft slot. */
export function slotValue(slot: number): number {
  const s = Math.max(1, Math.min(60, slot));
  const a = VALUE_ANCHORS;
  if (s <= a[0][0]) return a[0][1];
  if (s >= a[a.length - 1][0]) return a[a.length - 1][1];
  for (let i = 0; i < a.length - 1; i++) {
    const [s0, v0] = a[i];
    const [s1, v1] = a[i + 1];
    if (s >= s0 && s <= s1) {
      const t = (s - s0) / (s1 - s0);
      return v0 + t * (v1 - v0);
    }
  }
  return a[a.length - 1][1];
}

// Expected draft slot for each lottery seed (seed 1 = worst record), reflecting
// the post-2019 flattened lottery odds — the top three seeds share 14% odds so
// their expected landing spot is compressed around 3.
const LOTTERY_EXPECTED_SLOT = [
  3.0, 3.1, 3.3, 4.7, 5.6, 6.5, 7.4, 8.3, 9.2, 10.1, 11.0, 12.0, 13.0, 14.0,
];

// --- Projected league ranking -----------------------------------------------

/** Minutes-unaware rotation-strength proxy from DARKO DPM (top 9 by impact). */
function darkoStrength(abbr: string): number {
  const team = TEAMS.find((t) => t.abbreviation === abbr);
  if (!team) return 0;
  const dpms = team.players
    .map((p) => darkoFor(p.name)?.dpm)
    .filter((d): d is number => d != null)
    .sort((x, y) => y - x)
    .slice(0, 9);
  return dpms.reduce((s, d) => s + d, 0);
}

// Rank of every team, 1 = best projected finish .. 30 = worst. Built once from
// win totals if the seed covers most of the league, else from DARKO strength.
const PROJECTED_RANK: Record<string, number> = (() => {
  const abbrs = TEAMS.map((t) => t.abbreviation);
  const wins = SEEDED_WIN_TOTALS.wins;
  const useWins = abbrs.filter((a) => a in wins).length >= 25;
  const score = (a: string) => (useWins ? wins[a] ?? 0 : darkoStrength(a));
  const ranked = [...abbrs].sort((a, b) => score(b) - score(a));
  const rank: Record<string, number> = {};
  ranked.forEach((a, i) => (rank[a] = i + 1));
  return rank;
})();

/** True when picks are ordered by market win totals rather than DARKO fallback. */
export const USING_WIN_TOTALS =
  TEAMS.filter((t) => t.abbreviation in SEEDED_WIN_TOTALS.wins).length >= 25;

/** Expected draft slot for a team's own pick, from its projected league rank. */
function teamExpectedSlot(abbr: string): number {
  const rank = PROJECTED_RANK[abbr] ?? NEUTRAL_SLOT;
  // Ranks 17..30 (the 14 worst teams) are the lottery; seed = 31 - rank.
  if (rank >= 17) return LOTTERY_EXPECTED_SLOT[31 - rank - 1];
  // Playoff/play-in teams (ranks 1..16) draft 15..30 in reverse standing order.
  return 31 - rank;
}

export interface PickValuation {
  /** Expected draft slot after horizon regression. */
  slot: number;
  /** Value in $M. */
  value: number;
  yearsOut: number;
  /** 0..1 — how much weight the team projection still carries at this horizon. */
  confidence: number;
  /** Short human note on how this was valued / any condition haircut. */
  note: string;
}

/**
 * Value a single draft pick. Far-out picks regress toward a mid-first slot;
 * conditional ("in contention" / encumbered) picks take a modest haircut since
 * their conveyance is uncertain and SalarySwish doesn't expose the terms.
 */
export function valuePick(pick: DraftPick): PickValuation {
  const yearsOut = Math.max(0, pick.year - NEXT_DRAFT_YEAR);
  // Trust the team projection near-term; regress toward neutral as we look out.
  const weight = Math.max(0.15, 1 - 0.22 * yearsOut);

  let slot: number;
  if (pick.round === 2) {
    // Seconds: shift the team's slot into the second round (+30), regressed.
    const base = teamExpectedSlot(pick.originalTeam) + 30;
    slot = weight * base + (1 - weight) * (NEUTRAL_SLOT + 30);
  } else {
    const base = teamExpectedSlot(pick.originalTeam);
    slot = weight * base + (1 - weight) * NEUTRAL_SLOT;
  }

  let value = slotValue(slot);
  let note =
    yearsOut === 0
      ? `Projected ~#${Math.round(slot)} (${pick.originalTeam})`
      : `~#${Math.round(slot)} (${pick.originalTeam}, ${yearsOut}y out)`;

  // Conditional picks: uncertain conveyance, terms not exposed by the source.
  const conditional =
    pick.encumbered || (pick.notes ? /contention|protect|swap/i.test(pick.notes) : false);
  if (conditional) {
    value *= 0.85;
    note += ' · conditional';
  }

  return { slot, value, yearsOut, confidence: weight, note };
}

/** Total $M value of a set of picks. */
export function valuePicks(picks: DraftPick[]): number {
  return picks.reduce((s, p) => s + valuePick(p).value, 0);
}
