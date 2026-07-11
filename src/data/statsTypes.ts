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
  // DARKO projected per-100-possession box line (all optional; absent w/o a match).
  pts100?: number | null;
  ast100?: number | null;
  orb100?: number | null;
  drb100?: number | null;
  stl100?: number | null;
  blk100?: number | null;
  tov100?: number | null;
  fga100?: number | null;
  fg3a100?: number | null;
  fta100?: number | null;
  /** DARKO projected 3-point % (stored 0–1). */
  xFg3Pct?: number | null;

  // Aging view.
  /** Projected DPM 1–5 seasons out (current DPM × DARKO retention curve). */
  dpmY1?: number | null;
  dpmY2?: number | null;
  dpmY3?: number | null;
  dpmY4?: number | null;
  dpmY5?: number | null;
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

export type StatGroup = 'box' | 'advanced' | 'darko' | 'projected' | 'aging';

export const STAT_COLUMNS: StatColumn[] = [
  // DARKO — its own board, and folded into the Advanced view.
  { key: 'dpm', label: 'DPM', title: 'DARKO Daily Plus-Minus — projected net points per 100 possessions vs. an average player', decimals: 1, groups: ['darko', 'advanced', 'aging'] },
  { key: 'odpm', label: 'O-DPM', title: 'DARKO offensive plus-minus — offensive impact per 100 possessions', decimals: 1, groups: ['darko', 'advanced'] },
  { key: 'ddpm', label: 'D-DPM', title: 'DARKO defensive plus-minus — defensive impact per 100 possessions', decimals: 1, groups: ['darko', 'advanced'] },
  { key: 'salary', label: 'Cap Hit', title: 'Contract cap hit / actual salary this season ($M)', decimals: 1, money: true, groups: ['darko'] },
  { key: 'value', label: 'Value', title: "DARKO's estimated open-market value for this player ($M)", decimals: 1, money: true, groups: ['darko', 'advanced'] },
  { key: 'surplus', label: 'Surplus', title: 'Value minus Cap Hit ($M) — positive = a bargain, negative = overpaid', decimals: 1, money: true, groups: ['darko'] },
  { key: 'orb100', label: 'ORB/100', title: 'DARKO projected offensive rebounds per 100 possessions', decimals: 1, groups: ['darko', 'advanced', 'projected'] },
  { key: 'drb100', label: 'DRB/100', title: 'DARKO projected defensive rebounds per 100 possessions', decimals: 1, groups: ['darko', 'advanced', 'projected'] },

  // DARKO projected per-100 box line + shooting (its own "Projected" view).
  { key: 'pts100', label: 'PTS/100', title: 'DARKO projected points per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'ast100', label: 'AST/100', title: 'DARKO projected assists per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'stl100', label: 'STL/100', title: 'DARKO projected steals per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'blk100', label: 'BLK/100', title: 'DARKO projected blocks per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'tov100', label: 'TOV/100', title: 'DARKO projected turnovers per 100 possessions (lower is better)', decimals: 1, groups: ['projected'], higherBetter: false },
  { key: 'fga100', label: 'FGA/100', title: 'DARKO projected field-goal attempts per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'fg3a100', label: '3PA/100', title: 'DARKO projected 3-point attempts per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'fta100', label: 'FTA/100', title: 'DARKO projected free-throw attempts per 100 possessions', decimals: 1, groups: ['projected'] },
  { key: 'xFg3Pct', label: 'x3P%', title: 'DARKO projected 3-point percentage', decimals: 1, percent: true, groups: ['projected'] },

  // Aging view: current impact + the projected-DPM trajectory.
  { key: 'dpmY1', label: 'DPM +1', title: 'Projected DPM one season out (current DPM × DARKO retention curve)', decimals: 1, groups: ['aging'] },
  { key: 'dpmY2', label: 'DPM +2', title: 'Projected DPM two seasons out', decimals: 1, groups: ['aging'] },
  { key: 'dpmY3', label: 'DPM +3', title: 'Projected DPM three seasons out', decimals: 1, groups: ['aging'] },
  { key: 'dpmY4', label: 'DPM +4', title: 'Projected DPM four seasons out', decimals: 1, groups: ['aging'] },
  { key: 'dpmY5', label: 'DPM +5', title: 'Projected DPM five seasons out', decimals: 1, groups: ['aging'] },

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
