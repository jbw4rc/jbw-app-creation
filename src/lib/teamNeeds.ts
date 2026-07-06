import type { Team } from '../types';
import { rotationPlayers, allocation } from './minutesStore';
import { diagnoseLineup } from './lineupDiagnostics';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Team needs & resources — the GM's dashboard. Needs come straight from the
// lineup diagnostics (a watch/alert flag IS a need); resources summarize the
// ammunition available to fix them (signing power, draft capital, trade chips).
// ---------------------------------------------------------------------------

export interface TeamNeed {
  key: string;
  label: string;
  severity: 'critical' | 'moderate';
  detail: string;
}

/** Ranked needs: the team's alert (critical) then watch (moderate) diagnostics. */
export function teamNeeds(team: Team): TeamNeed[] {
  const rot = rotationPlayers(team.players);
  const mins = allocation(team.abbreviation, rot);
  const { flags } = diagnoseLineup(rot, mins);
  const needs: TeamNeed[] = [];
  for (const f of flags) {
    if (f.level === 'alert') needs.push({ key: f.key, label: f.label, severity: 'critical', detail: f.detail });
    else if (f.level === 'watch') needs.push({ key: f.key, label: f.label, severity: 'moderate', detail: f.detail });
  }
  return needs.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1));
}

export interface TradeChip {
  name: string;
  dpm: number | null;
  salary: number | null; // $M
  surplus: number | null; // $M value − salary
}

/**
 * The team's best trade chips: rotation players with the most surplus value
 * (DARKO market value above their salary) — the assets that make deals work.
 */
export function tradeChips(team: Team, limit = 3): TradeChip[] {
  return rotationPlayers(team.players)
    .map((p) => {
      const d = darkoFor(p.name);
      return { name: p.name, dpm: d?.dpm ?? null, salary: d?.salary ?? null, surplus: d?.surplus ?? null };
    })
    .filter((c) => c.surplus != null)
    .sort((a, b) => (b.surplus ?? -99) - (a.surplus ?? -99))
    .slice(0, limit);
}

/** Draft-capital tally (tradeable ammunition). */
export function draftTally(team: Team): { firsts: number; seconds: number } {
  return {
    firsts: team.draftCapital.filter((p) => p.round === 1).length,
    seconds: team.draftCapital.filter((p) => p.round === 2).length,
  };
}
