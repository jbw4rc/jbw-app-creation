import type { DraftPick, Team } from '../types';
import { CURRENT_SEASON } from './leagueConstants';
import { TEAM_META } from './teamMeta';
import { SEEDED_ROSTERS } from './seededRosters';
import { SEEDED_PICKS } from './seededPicks';

// ---------------------------------------------------------------------------
// League data. Rosters/salaries and real draft-pick ownership both come from
// SalarySwish (seededRosters.ts / seededPicks.ts), auto-pulled daily by
// scripts/build-salaries.mjs. Picks reflect actual trades, swaps, and
// protections; a team with no seeded picks falls back to its own future firsts.
// ---------------------------------------------------------------------------

function defaultPicks(abbr: string): DraftPick[] {
  const picks: DraftPick[] = [];
  for (let year = CURRENT_SEASON; year <= CURRENT_SEASON + 7; year++) {
    picks.push({ year, round: 1, originalTeam: abbr, notes: 'Own first-round pick (placeholder)' });
  }
  picks.push({ year: CURRENT_SEASON, round: 2, originalTeam: abbr });
  picks.push({ year: CURRENT_SEASON + 1, round: 2, originalTeam: abbr });
  return picks;
}

export const TEAMS: Team[] = TEAM_META.map((m) => ({
  abbreviation: m.abbreviation,
  name: m.name,
  conference: m.conference,
  players: SEEDED_ROSTERS[m.abbreviation] ?? [],
  draftCapital:
    SEEDED_PICKS[m.abbreviation]?.length
      ? SEEDED_PICKS[m.abbreviation]
      : defaultPicks(m.abbreviation),
}));

const teamByAbbr = new Map(TEAMS.map((t) => [t.abbreviation, t]));

export function getTeam(abbr: string): Team {
  const t = teamByAbbr.get(abbr);
  if (!t) throw new Error(`Unknown team ${abbr}`);
  return t;
}
