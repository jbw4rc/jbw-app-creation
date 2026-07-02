import type { Player, SeasonCap, Team } from '../types';
import { getSeasonCap } from '../data/leagueConstants';

// ---------------------------------------------------------------------------
// Apron engine.
//
// Classifies where a team's total salary sits relative to the five thresholds
// and enumerates the roster-building restrictions that attach at each level.
// This is the shared brain used by both the roster view and the trade machine.
// ---------------------------------------------------------------------------

/** Salary tier a team occupies for a given season, from lowest to highest. */
export type ApronTier =
  | 'underCap' // has cap space
  | 'overCap' // over cap, under the tax line
  | 'overTax' // in the luxury tax, under the first apron
  | 'firstApron' // at/over the first apron, under the second
  | 'secondApron'; // at/over the second apron

export interface TierInfo {
  tier: ApronTier;
  label: string;
  /** Tailwind-free semantic color key used by the UI. */
  color: 'green' | 'blue' | 'yellow' | 'orange' | 'red';
}

export const TIER_INFO: Record<ApronTier, TierInfo> = {
  underCap: { tier: 'underCap', label: 'Under the Cap', color: 'green' },
  overCap: { tier: 'overCap', label: 'Over Cap · Under Tax', color: 'blue' },
  overTax: { tier: 'overTax', label: 'Luxury Tax', color: 'yellow' },
  firstApron: { tier: 'firstApron', label: 'First Apron', color: 'orange' },
  secondApron: { tier: 'secondApron', label: 'Second Apron', color: 'red' },
};

/** Sum the salary a single player counts against the cap in a season. */
export function playerSalaryForSeason(player: Player, season: number): number {
  const year = player.contract.find((c) => c.season === season);
  if (!year) return 0;
  // UFA/RFA carry no cap hit (the player is off the books for that season).
  if (year.option === 'ufa' || year.option === 'rfa') return 0;
  return year.salary;
}

/** Total committed team salary for a season (excludes non-cap two-way deals). */
export function teamSalaryForSeason(team: Team, season: number): number {
  return team.players.reduce(
    (sum, p) => sum + (p.twoWay ? 0 : playerSalaryForSeason(p, season)),
    0
  );
}

/** Number of standard-contract players carrying salary (two-way excluded). */
export function rosteredCount(team: Team, season: number): number {
  return team.players.filter((p) => !p.twoWay && playerSalaryForSeason(p, season) > 0).length;
}

/**
 * NBA minimum active roster and the per-slot salary used to project filling it.
 * Teams round out the roster with rookie-minimum deals, so the projection uses
 * the 2026-27 rookie (0 years of service) minimum, not the veteran minimum.
 */
export const MIN_ROSTER = 14;
export const MIN_FILL_SALARY = 1_272_870;

export interface RosterFill {
  count: number;
  open: number;
  fillCost: number;
  projectedTotal: number;
  projectedTier: ApronTier;
}

/**
 * Projects the cost of filling an incomplete roster to the 14-man minimum at
 * the minimum salary — showing whether a team that sits below an apron will be
 * pushed over it once it rounds out the roster.
 */
export function rosterFillProjection(team: Team, season: number): RosterFill {
  const cap = getSeasonCap(season);
  const count = rosteredCount(team, season);
  const open = Math.max(0, MIN_ROSTER - count);
  const fillCost = open * MIN_FILL_SALARY;
  const projectedTotal = teamSalaryForSeason(team, season) + fillCost;
  return {
    count,
    open,
    fillCost,
    projectedTotal,
    projectedTier: classifyTier(projectedTotal, cap),
  };
}

export function classifyTier(totalSalary: number, cap: SeasonCap): ApronTier {
  if (totalSalary >= cap.secondApron) return 'secondApron';
  if (totalSalary >= cap.firstApron) return 'firstApron';
  if (totalSalary >= cap.luxuryTax) return 'overTax';
  if (totalSalary > cap.salaryCap) return 'overCap';
  return 'underCap';
}

export interface SeasonSalarySummary {
  season: number;
  cap: SeasonCap;
  totalSalary: number;
  tier: ApronTier;
  /** Positive = room under the line; negative = amount over the line. */
  spaceUnderCap: number;
  spaceUnderTax: number;
  spaceUnderFirstApron: number;
  spaceUnderSecondApron: number;
}

export function summarizeSeason(
  totalSalary: number,
  season: number
): SeasonSalarySummary {
  const cap = getSeasonCap(season);
  return {
    season,
    cap,
    totalSalary,
    tier: classifyTier(totalSalary, cap),
    spaceUnderCap: cap.salaryCap - totalSalary,
    spaceUnderTax: cap.luxuryTax - totalSalary,
    spaceUnderFirstApron: cap.firstApron - totalSalary,
    spaceUnderSecondApron: cap.secondApron - totalSalary,
  };
}

export function summarizeTeamSeason(
  team: Team,
  season: number
): SeasonSalarySummary {
  return summarizeSeason(teamSalaryForSeason(team, season), season);
}

// --- Restriction catalog -----------------------------------------------------

export interface Restriction {
  id: string;
  /** Lowest tier at which this restriction becomes active. */
  appliesFrom: ApronTier;
  title: string;
  detail: string;
}

/**
 * The roster-building tools a team LOSES once it crosses each apron. Ordered
 * by severity. `appliesFrom` is the first tier at which the restriction bites.
 */
export const RESTRICTIONS: Restriction[] = [
  // First apron
  {
    id: 'no-biannual',
    appliesFrom: 'firstApron',
    title: 'No Bi-Annual Exception',
    detail: 'Cannot use the bi-annual exception to sign free agents.',
  },
  {
    id: 'taxpayer-mle-only',
    appliesFrom: 'firstApron',
    title: 'Taxpayer MLE only',
    detail:
      'Limited to the smaller taxpayer mid-level exception; the full non-taxpayer MLE is off the table.',
  },
  {
    id: 'no-sign-and-trade-in',
    appliesFrom: 'firstApron',
    title: 'Cannot acquire via sign-and-trade',
    detail:
      'May not take in a player through a sign-and-trade (doing so hard-caps a team at the first apron).',
  },
  {
    id: 'no-buyout-over-mle',
    appliesFrom: 'firstApron',
    title: 'Limited buyout-market access',
    detail:
      'Cannot sign a waived player whose pre-waiver salary exceeded the non-taxpayer MLE.',
  },
  {
    id: 'trade-match-110',
    appliesFrom: 'firstApron',
    title: 'Tighter salary-matching (≤125%)',
    detail:
      'Loses the expanded up-to-200% trade matching available below the apron.',
  },
  // Second apron — everything above, plus:
  {
    id: 'no-taxpayer-mle',
    appliesFrom: 'secondApron',
    title: 'No mid-level exception at all',
    detail: 'Loses even the taxpayer MLE — no MLE signings whatsoever.',
  },
  {
    id: 'no-aggregation',
    appliesFrom: 'secondApron',
    title: 'Cannot aggregate salaries in a trade',
    detail:
      'May not combine two or more players’ salaries to match for an incoming contract.',
  },
  {
    id: 'no-take-back-more',
    appliesFrom: 'secondApron',
    title: 'Cannot take back more salary than sent',
    detail:
      'Incoming salary in any trade must be ≤ 100% of outgoing salary — no expanded matching.',
  },
  {
    id: 'no-cash-in-trade',
    appliesFrom: 'secondApron',
    title: 'Cannot send cash in trades',
    detail: 'May not include cash considerations to facilitate a deal.',
  },
  {
    id: 'no-tpe-from-prior-year',
    appliesFrom: 'secondApron',
    title: 'Cannot use prior-year TPEs / S&T exceptions',
    detail:
      'Trade exceptions generated in a previous season and sign-and-trade exceptions are frozen.',
  },
  {
    id: 'frozen-pick',
    appliesFrom: 'secondApron',
    title: 'First-round pick frozen (7 years out)',
    detail:
      'The pick seven drafts away cannot be traded. Stay in the second apron in 3 of 5 years and it drops to the end of the first round.',
  },
];

export function restrictionsForTier(tier: ApronTier): Restriction[] {
  const rank: Record<ApronTier, number> = {
    underCap: 0,
    overCap: 1,
    overTax: 2,
    firstApron: 3,
    secondApron: 4,
  };
  return RESTRICTIONS.filter((r) => rank[tier] >= rank[r.appliesFrom]);
}

/**
 * The draft year that becomes frozen for a second-apron team. Per the CBA it is
 * the first-round pick seven drafts into the future from the current season.
 */
export function frozenPickYear(currentSeason: number): number {
  return currentSeason + 7;
}

function m(n: number): string {
  return `$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;
}

/**
 * A short, human phrase describing where a team sits relative to the line that
 * defines its tier — e.g. "$4.2M over the second apron" or "$3.1M in cap space".
 */
export function apronStatusLine(s: SeasonSalarySummary): string {
  switch (s.tier) {
    case 'secondApron':
      return `${m(s.spaceUnderSecondApron)} over the second apron`;
    case 'firstApron':
      return `${m(s.spaceUnderFirstApron)} over the first apron`;
    case 'overTax':
      return `${m(s.spaceUnderTax)} into the luxury tax`;
    case 'overCap':
      return `${m(s.spaceUnderTax)} below the tax line`;
    default:
      return `${m(s.spaceUnderCap)} in cap space`;
  }
}

/** The distance to the next apron up (the one a team should watch), if any. */
export function nextApronNote(s: SeasonSalarySummary): string | null {
  if (s.tier === 'secondApron') return null;
  if (s.tier === 'firstApron') return `${m(s.spaceUnderSecondApron)} below the 2nd apron`;
  return `${m(s.spaceUnderFirstApron)} below the 1st apron`;
}
