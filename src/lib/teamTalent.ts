import type { Player, Team } from '../types';
import { projectedDpm } from './rookies';
import { unsignedFirstRounders } from './draftHolds';
import { allocation, rotationPlayers, minutesVersion } from './minutesStore';
import { getTeams, getBaselineTeams, rosterStoreVersion } from './teamStore';

// ---------------------------------------------------------------------------
// Team talent = a DARKO-based expected net rating.
//
// A lineup's net rating is roughly the sum of its five on-court players' DPM, so
// a team's expected net rating is the minutes-weighted sum of its rotation's
// DPM. A game has only 240 player-minutes to hand out (five on-court slots ×
// 48). We seed each player's share from DARKO's projected minutes (scaled to
// 240) and let the user hand-adjust it (see minutesStore); either way a player
// counts only for the minutes he actually plays, so a deep-bench scrub has no
// effect on team value. Each player's weight is his on-court fraction
// (minutes / 48).
// ---------------------------------------------------------------------------

/**
 * Expected net rating (DARKO) for a team's roster, minutes-weighted by the
 * team's allocation (manual overrides over the DARKO-scaled seed). `abbr` keys
 * the manual overrides; pass a hypothetical roster (e.g. post-trade) as
 * `players` and kept players keep their overrides while new ones get the seed.
 */
export function rosterDpm(abbr: string, players: Player[]): number {
  // Include the team's unsigned first-round picks (cap holds) — they'll sign and
  // play, and their rookie minutes/value belong in the team's expected rating.
  const rot = [...rotationPlayers(players), ...unsignedFirstRounders(abbr)];
  const mins = allocation(abbr, rot);
  let total = 0;
  for (const p of rot) {
    const dpm = projectedDpm(p); // DARKO, else the rookie model
    if (dpm == null) continue;
    total += dpm * ((mins[p.id] ?? 0) / 48); // on-court fraction of the game
  }
  return total;
}

export function teamDpm(team: Team): number {
  return rosterDpm(team.abbreviation, team.players);
}

export type TalentTier = 'contender' | 'playoff' | 'fringe' | 'cellar';

export const TIER_META: Record<TalentTier, { label: string; color: string }> = {
  contender: { label: 'Contender', color: 'green' },
  playoff: { label: 'Playoff', color: 'blue' },
  fringe: { label: 'Fringe / Play-in', color: 'yellow' },
  cellar: { label: 'Cellar', color: 'red' },
};

// Tiers by overall talent RANK (1–30): the DARKO net-rating scale is compressed,
// so a rank-band bar reads more cleanly than a value cutoff and makes trade/
// signing rank shifts easy to narrate. Top 6 are title threats; 7–16 fill out
// the playoff/play-in field; 17–22 are on the bubble; 23–30 are lottery-bound.
export function tierForRank(rank: number): TalentTier {
  if (rank <= 6) return 'contender';
  if (rank <= 16) return 'playoff';
  if (rank <= 22) return 'fringe';
  return 'cellar';
}

// --- League table (recomputed when the minutes allocation changes) -----------
interface Row {
  abbr: string;
  conf: 'East' | 'West';
  dpm: number;
}

function rankTeams(teams: Team[]): Row[] {
  return teams
    .map((t) => ({ abbr: t.abbreviation, conf: t.conference, dpm: teamDpm(t) }))
    .sort((a, b) => b.dpm - a.dpm);
}

let leagueCache: Row[] | null = null;
let baselineCache: Row[] | null = null;
let leagueVer = '';

// Recompute the league(s) when either the minutes allocation or the rosters
// (imports / GM-session moves) change.
function versionKey(): string {
  return `${minutesVersion()}:${rosterStoreVersion()}`;
}

/** The 30 teams ranked by DPM (live, session-adjusted rosters). */
function league(): Row[] {
  const v = versionKey();
  if (leagueCache && leagueVer === v) return leagueCache;
  leagueCache = rankTeams(getTeams());
  baselineCache = null;
  leagueVer = v;
  return leagueCache;
}

/** The 30 teams ranked at session start (== live if no session). */
function baselineLeague(): Row[] {
  league(); // ensure leagueVer is current (and baselineCache invalidated if stale)
  if (!baselineCache) baselineCache = rankTeams(getBaselineTeams());
  return baselineCache;
}

export interface TalentInfo {
  dpm: number;
  overallRank: number; // 1..30
  confRank: number; // 1..15
  conference: 'East' | 'West';
  tier: TalentTier;
}

function talentFrom(L: Row[], abbr: string): TalentInfo | null {
  const idx = L.findIndex((r) => r.abbr === abbr);
  if (idx < 0) return null;
  const row = L[idx];
  const confRank = L.filter((r) => r.conf === row.conf).findIndex((r) => r.abbr === abbr) + 1;
  return {
    dpm: row.dpm,
    overallRank: idx + 1,
    confRank,
    conference: row.conf,
    tier: tierForRank(idx + 1),
  };
}

/** Live talent/rank (session-adjusted rosters). */
export function teamTalent(abbr: string): TalentInfo | null {
  return talentFrom(league(), abbr);
}

/** Talent/rank as of session start — for comparing a GM session's progress. */
export function baselineTeamTalent(abbr: string): TalentInfo | null {
  return talentFrom(baselineLeague(), abbr);
}

/**
 * Rank (overall + conference) a hypothetical roster DPM would slot into, by
 * inserting it against the other 29 teams. Used for trade/signing what-ifs.
 */
export function rankForDpm(abbr: string, dpm: number): { overall: number; conf: number } {
  const L = league();
  const conf = L.find((r) => r.abbr === abbr)?.conf ?? 'East';
  const others = L.filter((r) => r.abbr !== abbr);
  const overall = others.filter((r) => r.dpm > dpm).length + 1;
  const conf_ = others.filter((r) => r.conf === conf && r.dpm > dpm).length + 1;
  return { overall, conf: conf_ };
}
