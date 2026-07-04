import type { Player, Team } from '../types';
import { TEAMS } from '../data/teams';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Team talent = a DARKO-based expected net rating.
//
// A lineup's net rating is roughly the sum of its five on-court players' DPM, so
// a team's expected net rating is the minutes-weighted sum of its rotation's
// DPM. We approximate minutes with a fixed rotation template (five starters at
// ~35 mpg, a four-man bench) whose weights sum to 5 (five players on court).
// This ranks teams and sorts them into contender / playoff / fringe / cellar.
// ---------------------------------------------------------------------------

// Weights sum to 5.0 (five on-court slots): starters ~0.72 (≈34.6 mpg), bench ~0.35.
const ROTATION_WEIGHTS = [0.72, 0.72, 0.72, 0.72, 0.72, 0.35, 0.35, 0.35, 0.35];

/** Expected net rating (DARKO) for any set of players. */
export function rosterDpm(players: Player[]): number {
  const dpms = players
    .map((p) => (p.twoWay ? undefined : darkoFor(p.name)?.dpm))
    .filter((d): d is number => d != null)
    .sort((a, b) => b - a);
  let total = 0;
  for (let i = 0; i < dpms.length && i < ROTATION_WEIGHTS.length; i++) {
    total += dpms[i] * ROTATION_WEIGHTS[i];
  }
  return total;
}

export function teamDpm(team: Team): number {
  return rosterDpm(team.players);
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

// --- Precomputed league table -----------------------------------------------
interface Row {
  abbr: string;
  conf: 'East' | 'West';
  dpm: number;
}
const LEAGUE: Row[] = TEAMS.map((t) => ({
  abbr: t.abbreviation,
  conf: t.conference,
  dpm: teamDpm(t),
})).sort((a, b) => b.dpm - a.dpm);

const OVERALL_RANK: Record<string, number> = {};
LEAGUE.forEach((r, i) => (OVERALL_RANK[r.abbr] = i + 1));
const CONF_RANK: Record<string, number> = {};
(['East', 'West'] as const).forEach((conf) => {
  LEAGUE.filter((r) => r.conf === conf).forEach((r, i) => (CONF_RANK[r.abbr] = i + 1));
});

export interface TalentInfo {
  dpm: number;
  overallRank: number; // 1..30
  confRank: number; // 1..15
  conference: 'East' | 'West';
  tier: TalentTier;
}

export function teamTalent(abbr: string): TalentInfo | null {
  const row = LEAGUE.find((r) => r.abbr === abbr);
  if (!row) return null;
  return {
    dpm: row.dpm,
    overallRank: OVERALL_RANK[abbr],
    confRank: CONF_RANK[abbr],
    conference: row.conf,
    tier: tierForRank(OVERALL_RANK[abbr]),
  };
}

/**
 * Rank (overall + conference) a hypothetical roster DPM would slot into, by
 * inserting it against the other 29 teams. Used for trade/signing what-ifs.
 */
export function rankForDpm(abbr: string, dpm: number): { overall: number; conf: number } {
  const conf = LEAGUE.find((r) => r.abbr === abbr)?.conf ?? 'East';
  const others = LEAGUE.filter((r) => r.abbr !== abbr);
  const overall = others.filter((r) => r.dpm > dpm).length + 1;
  const conf_ = others.filter((r) => r.conf === conf && r.dpm > dpm).length + 1;
  return { overall, conf: conf_ };
}
