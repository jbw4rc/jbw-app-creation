// Vegas win-total futures for the upcoming season, keyed by team abbreviation.
// Populated by scripts/build-wintotals.mjs (run in CI) once a reachable futures
// source is wired up. Until then this is empty and the draft-value engine falls
// back to a DARKO-derived team-strength ranking. Win totals are the market's
// post-offseason consensus on where a team finishes, which drives the projected
// draft slot for that team's picks.
export interface WinTotalSeed {
  /** Season these totals project, e.g. "2026-27". */
  season: string;
  /** ISO timestamp pulled. */
  asOf: string;
  source: string;
  /** abbreviation -> projected regular-season wins. */
  wins: Record<string, number>;
}

export const SEEDED_WIN_TOTALS: WinTotalSeed = {
  season: '',
  asOf: '',
  source: '',
  wins: {},
};
