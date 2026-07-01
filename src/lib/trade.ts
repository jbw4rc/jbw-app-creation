import type { Player, Team } from '../types';
import {
  type ApronTier,
  classifyTier,
  playerSalaryForSeason,
  teamSalaryForSeason,
} from './apron';
import { getSeasonCap } from '../data/leagueConstants';

// ---------------------------------------------------------------------------
// Trade legality engine.
//
// Evaluates a proposed swap between two teams for a single season and reports,
// per team: salary in/out, resulting apron tier, the maximum salary that can
// legally be taken back, and any apron-driven violations. A trade is legal only
// when no team has a `block`-severity violation.
//
// The salary-matching bands and apron rules below implement the 2023 CBA in a
// simplified, clearly-labeled form suitable for planning. They are intentionally
// conservative: when in doubt the engine blocks rather than green-lighting an
// illegal deal.
// ---------------------------------------------------------------------------

export type ViolationSeverity = 'block' | 'warn';

export interface TradeViolation {
  code: string;
  severity: ViolationSeverity;
  title: string;
  detail: string;
}

export interface TeamTradeResult {
  teamAbbr: string;
  teamName: string;
  outgoingPlayers: Player[];
  incomingPlayers: Player[];
  outgoingSalary: number;
  incomingSalary: number;
  cashSent: number;
  preSalary: number;
  postSalary: number;
  preTier: ApronTier;
  postTier: ApronTier;
  /** Maximum incoming salary this team may legally absorb given what it sends. */
  maxAllowedIncoming: number;
  crossesFirstApron: boolean;
  crossesSecondApron: boolean;
  /** If the deal hard-caps the team, the line it is capped at. */
  hardCappedAt?: 'firstApron' | 'secondApron';
  violations: TradeViolation[];
}

export interface TradeEvaluation {
  season: number;
  teams: TeamTradeResult[];
  legal: boolean;
  /** Flattened block-severity violations for quick display. */
  blockingViolations: TradeViolation[];
}

const OVERAGE = 250_000;
const EXPANDED_LOW_LIMIT = 7_500_000;
const EXPANDED_MID_LIMIT = 29_000_000;
const EXPANDED_MID_BONUS = 7_500_000;

function sumSalaries(players: Player[], season: number): number {
  return players.reduce((s, p) => s + playerSalaryForSeason(p, season), 0);
}

/**
 * Maximum salary a team may take back, based on the salary it sends out and the
 * tier it occupies before the trade.
 *
 * - Under the cap: absorb outgoing + remaining cap room.
 * - Below the first apron: expanded matching (up to 200% on small deals).
 * - First apron: standard 125% + $250k matching.
 * - Second apron: dollar-for-dollar (≤ 100%), no expansion.
 */
function maxIncomingFor(
  preTier: ApronTier,
  outgoing: number,
  capRoom: number
): number {
  if (preTier === 'secondApron') {
    return outgoing; // cannot take back more than sent
  }
  if (preTier === 'firstApron') {
    return outgoing * 1.25 + OVERAGE;
  }

  // Below the first apron: expanded matching tiers.
  let expanded: number;
  if (outgoing <= EXPANDED_LOW_LIMIT) {
    expanded = outgoing * 2 + OVERAGE;
  } else if (outgoing <= EXPANDED_MID_LIMIT) {
    expanded = outgoing + EXPANDED_MID_BONUS;
  } else {
    expanded = outgoing * 1.25 + OVERAGE;
  }

  if (preTier === 'underCap') {
    // A team with cap space can also simply absorb salary into that room.
    return Math.max(expanded, outgoing + Math.max(capRoom, 0));
  }
  return expanded;
}

function playersByIds(team: Team, ids: string[]): Player[] {
  return ids
    .map((id) => team.players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
}

export interface ProposedTradeSide {
  team: Team;
  outgoingPlayerIds: string[];
  cashSent?: number;
}

/**
 * Evaluate a two-team trade. Each side lists the players it sends out; the
 * engine routes those players to the other side as incoming.
 */
export function evaluateTrade(
  sideA: ProposedTradeSide,
  sideB: ProposedTradeSide,
  season: number
): TradeEvaluation {
  const cap = getSeasonCap(season);

  const buildResult = (
    self: ProposedTradeSide,
    other: ProposedTradeSide
  ): TeamTradeResult => {
    const outgoingPlayers = playersByIds(self.team, self.outgoingPlayerIds);
    const incomingPlayers = playersByIds(other.team, other.outgoingPlayerIds);

    const outgoingSalary = sumSalaries(outgoingPlayers, season);
    const incomingSalary = sumSalaries(incomingPlayers, season);
    const cashSent = self.cashSent ?? 0;

    const preSalary = teamSalaryForSeason(self.team, season);
    const postSalary = preSalary - outgoingSalary + incomingSalary;

    const preTier = classifyTier(preSalary, cap);
    const postTier = classifyTier(postSalary, cap);

    const capRoom = cap.salaryCap - preSalary;
    const maxAllowedIncoming = maxIncomingFor(preTier, outgoingSalary, capRoom);

    const crossesFirstApron =
      preSalary < cap.firstApron && postSalary >= cap.firstApron;
    const crossesSecondApron =
      preSalary < cap.secondApron && postSalary >= cap.secondApron;

    const violations: TradeViolation[] = [];
    let hardCappedAt: TeamTradeResult['hardCappedAt'];

    // --- Salary matching ---
    // Cap-space teams that stay under the cap never need to match.
    const needsMatching = !(preTier === 'underCap' && postSalary <= cap.salaryCap);
    if (needsMatching && incomingSalary > maxAllowedIncoming + 1) {
      violations.push({
        code: 'salary-match',
        severity: 'block',
        title: 'Salary matching fails',
        detail: `Takes back ${fmt(incomingSalary)} but may only absorb ${fmt(
          maxAllowedIncoming
        )} against ${fmt(outgoingSalary)} sent out.`,
      });
    }

    // --- Second-apron team: already over the line ---
    if (preTier === 'secondApron') {
      if (incomingSalary > outgoingSalary + 1) {
        violations.push({
          code: 'second-apron-takeback',
          severity: 'block',
          title: 'Second-apron team cannot take back more than it sends',
          detail: `Over the second apron, incoming salary (${fmt(
            incomingSalary
          )}) must be ≤ outgoing salary (${fmt(outgoingSalary)}).`,
        });
      }
      if (outgoingPlayers.length > 1) {
        violations.push({
          code: 'second-apron-aggregate',
          severity: 'block',
          title: 'Second-apron team cannot aggregate salaries',
          detail:
            'Combining two or more outgoing contracts to match a larger incoming salary is prohibited above the second apron.',
        });
      }
      if (cashSent > 0) {
        violations.push({
          code: 'second-apron-cash',
          severity: 'block',
          title: 'Second-apron team cannot send cash',
          detail: 'Cash considerations may not be included above the second apron.',
        });
      }
    }

    // --- Deals that would newly cross an apron (hard cap) ---
    if (crossesSecondApron) {
      violations.push({
        code: 'cross-second-apron',
        severity: 'block',
        title: 'Trade pushes team over the second apron',
        detail: `Post-trade salary of ${fmt(
          postSalary
        )} exceeds the second apron (${fmt(
          cap.secondApron
        )}). A team cannot use a trade to cross into the second apron.`,
      });
      hardCappedAt = 'secondApron';
    } else if (crossesFirstApron) {
      // Crossing the first apron via expanded matching is not allowed; using
      // any expansion beyond 125% hard-caps at the first apron.
      hardCappedAt = 'firstApron';
      if (incomingSalary > outgoingSalary * 1.25 + OVERAGE + 1) {
        violations.push({
          code: 'cross-first-apron-expanded',
          severity: 'block',
          title: 'Cannot use expanded matching to cross the first apron',
          detail: `Taking back ${fmt(
            incomingSalary
          )} exceeds the 125% + $250k limit that applies once a deal reaches the first apron (${fmt(
            cap.firstApron
          )}).`,
        });
      } else {
        violations.push({
          code: 'cross-first-apron-warn',
          severity: 'warn',
          title: 'Trade pushes team into the first apron',
          detail: `Post-trade salary of ${fmt(
            postSalary
          )} crosses the first apron; the team becomes hard-capped and loses apron exceptions.`,
        });
      }
    }

    // Warn when a team is entering luxury tax territory.
    if (
      preTier !== 'overTax' &&
      preTier !== 'firstApron' &&
      preTier !== 'secondApron' &&
      postSalary >= cap.luxuryTax &&
      postSalary < cap.firstApron
    ) {
      violations.push({
        code: 'enter-tax',
        severity: 'warn',
        title: 'Trade takes team into the luxury tax',
        detail: `Post-trade salary of ${fmt(postSalary)} is above the tax line (${fmt(
          cap.luxuryTax
        )}).`,
      });
    }

    return {
      teamAbbr: self.team.abbreviation,
      teamName: self.team.name,
      outgoingPlayers,
      incomingPlayers,
      outgoingSalary,
      incomingSalary,
      cashSent,
      preSalary,
      postSalary,
      preTier,
      postTier,
      maxAllowedIncoming,
      crossesFirstApron,
      crossesSecondApron,
      hardCappedAt,
      violations,
    };
  };

  const teams = [buildResult(sideA, sideB), buildResult(sideB, sideA)];
  const blockingViolations = teams.flatMap((t) =>
    t.violations.filter((v) => v.severity === 'block')
  );

  return {
    season,
    teams,
    legal: blockingViolations.length === 0,
    blockingViolations,
  };
}

function fmt(n: number): string {
  return `$${(n / 1_000_000).toFixed(2)}M`;
}
