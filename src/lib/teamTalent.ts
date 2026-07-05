import type { Player, Team } from '../types';
import { TEAMS } from '../data/teams';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Team talent = a DARKO-based expected net rating.
//
// A lineup's net rating is roughly the sum of its five on-court players' DPM, so
// a team's expected net rating is the minutes-weighted sum of its rotation's
// DPM. A game has only 240 player-minutes to hand out (five on-court slots ×
// 48), so we allocate that finite budget by each player's DARKO-projected
// minutes (x_minutes): the rotation gets minutes in order of projected playing
// time, and once the 240 are spent the deep bench gets zero — a scrub who won't
// play has no effect on team value, exactly as in reality. Each player's weight
// is his on-court fraction (minutes / 48), so the weights sum to at most 5.
// ---------------------------------------------------------------------------

const TEAM_MINUTES = 240; // five on-court slots × 48 minutes
const MAX_MPG = 38; // cap a single player's share (tames small-sample outliers)

/** Expected net rating (DARKO), minutes-weighted by DARKO's projected minutes. */
export function rosterDpm(players: Player[]): number {
  const rows = players
    .filter((p) => !p.twoWay)
    .map((p) => {
      const d = darkoFor(p.name);
      return d?.dpm != null ? { dpm: d.dpm, min: Math.min(d.min ?? 0, MAX_MPG) } : null;
    })
    .filter((r): r is { dpm: number; min: number } => r != null && r.min > 0);

  // Projected minutes usually over-subscribe the 240-minute game (DARKO gives
  // everyone a full-role projection). Scale them down proportionally to fit the
  // budget so each player keeps his relative role rather than the marginal
  // rotation player being zeroed out. A thin/short roster stays under 240 (no
  // scale-up), so its weights sum to < 5 — a genuinely shallow team.
  const totalMin = rows.reduce((s, r) => s + r.min, 0);
  const scale = totalMin > TEAM_MINUTES ? TEAM_MINUTES / totalMin : 1;
  let total = 0;
  for (const r of rows) {
    total += r.dpm * ((r.min * scale) / 48); // on-court fraction of the game
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
