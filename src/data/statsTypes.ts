// Types for the advanced-stats module (FanGraphs-style team + leaderboard view).
// Populated from Basketball-Reference via scripts/build-stats.mjs (run in CI,
// since the dev sandbox can't reach the web).

export interface PlayerStats {
  /** Basketball-Reference player id, e.g. "jokicni01". */
  id: string;
  name: string;
  /** Our 3-letter team abbreviation, or "2TM"/"3TM" for a traded player's combined line. */
  team: string;
  /** Every real team the player suited up for this season (drives the team view). */
  teams: string[];
  pos: string;
  age: number;
  g: number;
  gs: number;
  /** Minutes per game. */
  mpg: number;

  // Per-game box score
  pts: number;
  trb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgPct: number;
  fg3Pct: number;
  ftPct: number;

  // Advanced
  per: number;
  tsPct: number;
  usgPct: number;
  astPct: number;
  trbPct: number;
  stlPct: number;
  blkPct: number;
  tovPct: number;
  ows: number;
  dws: number;
  ws: number;
  ws48: number;
  obpm: number;
  dbpm: number;
  bpm: number;
  vorp: number;

  // DARKO Daily Plus-Minus (joined by name from darko.app; may be absent).
  dpm?: number | null;
  odpm?: number | null;
  ddpm?: number | null;
  /** Contract cap hit (actual salary), in $M. */
  salary?: number | null;
  /** DARKO estimated market value, in $M. */
  value?: number | null;
  /** DARKO market value minus actual salary, in $M. */
  surplus?: number | null;
}

export interface StatsBundle {
  /** e.g. "2025-26". */
  season: string;
  seasonLabel: string;
  /** ISO timestamp the data was pulled. */
  asOf: string;
  source: string;
  players: PlayerStats[];
}

/** A single displayable/sortable stat column. */
export interface StatColumn {
  key: keyof PlayerStats;
  label: string;
  /** Longer description for tooltips. */
  title: string;
  /** Decimal places; 0 for integers. Percentages are stored 0–1 and shown ×100. */
  decimals: number;
  percent?: boolean;
  /** Render as a dollar figure in millions (value stored in $M). */
  money?: boolean;
  /** Column-set memberships (a stat can appear in more than one view). */
  groups: StatGroup[];
  /** Higher is better (default true) — drives leaderboard default sort direction. */
  higherBetter?: boolean;
}

export type StatGroup = 'box' | 'advanced' | 'darko';

export const STAT_COLUMNS: StatColumn[] = [
  // DARKO — its own board, and folded into the Advanced view.
  { key: 'dpm', label: 'DPM', title: 'DARKO Daily Plus-Minus — projected net points per 100 possessions vs. an average player', decimals: 1, groups: ['darko', 'advanced'] },
  { key: 'odpm', label: 'O-DPM', title: 'DARKO offensive plus-minus — offensive impact per 100 possessions', decimals: 1, groups: ['darko', 'advanced'] },
  { key: 'ddpm', label: 'D-DPM', title: 'DARKO defensive plus-minus — defensive impact per 100 possessions', decimals: 1, groups: ['darko', 'advanced'] },
  { key: 'salary', label: 'Cap Hit', title: 'Contract cap hit / actual salary this season ($M)', decimals: 1, money: true, groups: ['darko'] },
  { key: 'value', label: 'Value', title: "DARKO's estimated open-market value for this player ($M)", decimals: 1, money: true, groups: ['darko', 'advanced'] },
  { key: 'surplus', label: 'Surplus', title: 'Value minus Cap Hit ($M) — positive = a bargain, negative = overpaid', decimals: 1, money: true, groups: ['darko'] },

  { key: 'pts', label: 'PTS', title: 'Points per game', decimals: 1, groups: ['box'] },
  { key: 'trb', label: 'REB', title: 'Rebounds per game', decimals: 1, groups: ['box'] },
  { key: 'ast', label: 'AST', title: 'Assists per game', decimals: 1, groups: ['box'] },
  { key: 'stl', label: 'STL', title: 'Steals per game', decimals: 1, groups: ['box'] },
  { key: 'blk', label: 'BLK', title: 'Blocks per game', decimals: 1, groups: ['box'] },
  { key: 'tov', label: 'TOV', title: 'Turnovers per game (lower is better)', decimals: 1, groups: ['box'], higherBetter: false },
  { key: 'fgPct', label: 'FG%', title: 'Field-goal percentage', decimals: 1, percent: true, groups: ['box'] },
  { key: 'fg3Pct', label: '3P%', title: 'Three-point percentage', decimals: 1, percent: true, groups: ['box'] },
  { key: 'ftPct', label: 'FT%', title: 'Free-throw percentage', decimals: 1, percent: true, groups: ['box'] },

  { key: 'tsPct', label: 'TS%', title: 'True Shooting % — scoring efficiency counting 2s, 3s and free throws', decimals: 1, percent: true, groups: ['advanced'] },
  { key: 'usgPct', label: 'USG%', title: 'Usage rate — share of team possessions a player uses while on court', decimals: 1, percent: true, groups: ['advanced'] },
  { key: 'astPct', label: 'AST%', title: "Assist % — share of teammates' field goals a player assisted while on court", decimals: 1, percent: true, groups: ['advanced'] },
  { key: 'trbPct', label: 'REB%', title: 'Rebound % — share of available rebounds grabbed while on court', decimals: 1, percent: true, groups: ['advanced'] },
  { key: 'tovPct', label: 'TOV%', title: 'Turnover % — turnovers per 100 plays used (lower is better)', decimals: 1, percent: true, groups: ['advanced'], higherBetter: false },
  { key: 'bpm', label: 'BPM', title: 'Box Plus/Minus — box-score estimate of points per 100 possessions above average', decimals: 1, groups: ['advanced'] },
  { key: 'ws', label: 'WS', title: 'Win Shares — estimated wins a player contributed', decimals: 1, groups: ['advanced'] },

  // Available only in the "All" view.
  { key: 'obpm', label: 'OBPM', title: 'Offensive Box Plus/Minus', decimals: 1, groups: [] },
  { key: 'dbpm', label: 'DBPM', title: 'Defensive Box Plus/Minus', decimals: 1, groups: [] },
  { key: 'ws48', label: 'WS/48', title: 'Win Shares per 48 minutes', decimals: 3, groups: [] },
];
