import type { DraftPick, Player, SeasonCap, Team } from '../types';
import {
  type ApronTier,
  classifyTier,
  frozenPickYear,
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

/** A trade exception a team elects to absorb incoming salary into. */
export interface SelectedTpe {
  player: string;
  remaining: number;
  /** Past its end date — cannot be used. */
  expired: boolean;
  /** Generated before the current league year — frozen for second-apron teams. */
  priorYear: boolean;
}

export interface TeamTradeResult {
  teamAbbr: string;
  teamName: string;
  outgoingPlayers: Player[];
  incomingPlayers: Player[];
  outgoingPicks: DraftPick[];
  incomingPicks: DraftPick[];
  outgoingSalary: number;
  incomingSalary: number;
  cashSent: number;
  /** Extra incoming capacity granted by the selected TPE (0 if none/invalid). */
  tpeCapacity: number;
  tpeUsed?: SelectedTpe;
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
  outgoingPicks?: DraftPick[];
  cashSent?: number;
  /** A trade exception this side elects to absorb incoming salary into. */
  tpe?: SelectedTpe;
}

// Per-team result: given what a team sends out (self) and what it takes in
// (incomingPlayers/Picks, routed from partners), classify tiers, salary matching
// and apron violations. Shared by two-team and multi-team evaluation.
function computeTeamResult(
  self: ProposedTradeSide,
  incomingPlayers: Player[],
  incomingPicks: DraftPick[],
  cap: SeasonCap,
  season: number
): TeamTradeResult {
    const outgoingPlayers = playersByIds(self.team, self.outgoingPlayerIds);
    const outgoingPicks = self.outgoingPicks ?? [];

    const outgoingSalary = sumSalaries(outgoingPlayers, season);
    const incomingSalary = sumSalaries(incomingPlayers, season);
    const cashSent = self.cashSent ?? 0;

    const preSalary = teamSalaryForSeason(self.team, season);
    const postSalary = preSalary - outgoingSalary + incomingSalary;

    const preTier = classifyTier(preSalary, cap);
    const postTier = classifyTier(postSalary, cap);

    const capRoom = cap.salaryCap - preSalary;

    const violations: TradeViolation[] = [];

    // --- Trade exception (TPE) absorption ---
    // A valid TPE lets the team take back salary beyond normal matching, up to
    // its remaining amount, as a separate slot.
    const tpe = self.tpe;
    let tpeCapacity = 0;
    if (tpe) {
      if (tpe.expired) {
        violations.push({
          code: 'tpe-expired',
          severity: 'block',
          title: 'Trade exception has expired',
          detail: `The ${tpe.player} trade exception is past its end date and can no longer be used.`,
        });
      } else if (preTier === 'secondApron' && tpe.priorYear) {
        violations.push({
          code: 'tpe-second-apron',
          severity: 'block',
          title: 'Second-apron team cannot use a prior-year TPE',
          detail: `Over the second apron, trade exceptions generated in a previous league year (here, ${tpe.player}) are frozen.`,
        });
      } else {
        tpeCapacity = tpe.remaining;
      }
    }

    const maxAllowedIncoming =
      maxIncomingFor(preTier, outgoingSalary, capRoom) + tpeCapacity;

    const crossesFirstApron =
      preSalary < cap.firstApron && postSalary >= cap.firstApron;
    const crossesSecondApron =
      preSalary < cap.secondApron && postSalary >= cap.secondApron;

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
      if (incomingSalary > outgoingSalary + tpeCapacity + 1) {
        violations.push({
          code: 'second-apron-takeback',
          severity: 'block',
          title: 'Second-apron team cannot take back more than it sends',
          detail: `Over the second apron, incoming salary (${fmt(
            incomingSalary
          )}) must be ≤ outgoing salary (${fmt(outgoingSalary)})${
            tpeCapacity > 0 ? ` plus the ${fmt(tpeCapacity)} trade exception` : ''
          }.`,
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
      // The team's own first-round pick seven drafts out is frozen.
      const frozen = frozenPickYear(season);
      for (const pk of outgoingPicks) {
        if (pk.round === 1 && pk.year === frozen && pk.originalTeam === self.team.abbreviation) {
          violations.push({
            code: 'frozen-pick',
            severity: 'block',
            title: 'Cannot trade a frozen first-round pick',
            detail: `Over the second apron, the ${pk.year} first-round pick is frozen and cannot be traded.`,
          });
        }
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

    // Acquiring a player via sign-and-trade hard-caps the team at the first
    // apron — it may not sit above the first apron after the deal.
    const receivesSignAndTrade = incomingPlayers.some((p) => p.signedUsing === 'Sign-and-Trade');
    if (receivesSignAndTrade) {
      hardCappedAt = 'firstApron';
      if (postSalary > cap.firstApron) {
        violations.push({
          code: 'st-hardcap',
          severity: 'block',
          title: 'Sign-and-trade hard-caps at the first apron',
          detail: `Taking in a sign-and-trade hard-caps the team at the first apron (${fmt(
            cap.firstApron
          )}); post-trade salary of ${fmt(postSalary)} exceeds it.`,
        });
      }
    }

    return {
      teamAbbr: self.team.abbreviation,
      teamName: self.team.name,
      outgoingPlayers,
      incomingPicks,
      outgoingPicks,
      incomingPlayers,
      outgoingSalary,
      incomingSalary,
      cashSent,
      tpeCapacity,
      tpeUsed: tpe,
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
}

function finalize(season: number, teams: TeamTradeResult[]): TradeEvaluation {
  const blockingViolations = teams.flatMap((t) =>
    t.violations.filter((v) => v.severity === 'block')
  );
  return { season, teams, legal: blockingViolations.length === 0, blockingViolations };
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
  const aOut = playersByIds(sideA.team, sideA.outgoingPlayerIds);
  const bOut = playersByIds(sideB.team, sideB.outgoingPlayerIds);
  return finalize(season, [
    computeTeamResult(sideA, bOut, sideB.outgoingPicks ?? [], cap, season),
    computeTeamResult(sideB, aOut, sideA.outgoingPicks ?? [], cap, season),
  ]);
}

/** A team's side of a multi-team trade, with per-asset destinations. */
export interface MultiTeamSide extends ProposedTradeSide {
  /** outgoing player id -> destination team abbreviation. */
  playerDest: Record<string, string>;
  /** destination team abbreviation for each outgoing pick (index-aligned). */
  pickDest: string[];
}

/**
 * Evaluate a trade among 2–4 teams. Each side's outgoing assets carry a
 * destination; a team's incoming set is everything routed to it.
 */
export function evaluateMultiTeamTrade(
  sides: MultiTeamSide[],
  season: number
): TradeEvaluation {
  const cap = getSeasonCap(season);
  const results = sides.map((self) => {
    const incomingPlayers: Player[] = [];
    const incomingPicks: DraftPick[] = [];
    for (const other of sides) {
      if (other.team.abbreviation === self.team.abbreviation) continue;
      other.outgoingPlayerIds.forEach((pid) => {
        if (other.playerDest[pid] === self.team.abbreviation) {
          const p = other.team.players.find((x) => x.id === pid);
          if (p) incomingPlayers.push(p);
        }
      });
      (other.outgoingPicks ?? []).forEach((pick, i) => {
        if (other.pickDest[i] === self.team.abbreviation) incomingPicks.push(pick);
      });
    }
    return computeTeamResult(self, incomingPlayers, incomingPicks, cap, season);
  });
  return finalize(season, results);
}

function fmt(n: number): string {
  return `$${(n / 1_000_000).toFixed(2)}M`;
}
