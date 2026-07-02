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
  /** Grouping for column sets. */
  group: 'box' | 'advanced' | 'value' | 'darko';
  /** Higher is better (default true) — drives leaderboard default sort direction. */
  higherBetter?: boolean;
}

export const STAT_COLUMNS: StatColumn[] = [
  { key: 'dpm', label: 'DPM', title: 'DARKO Daily Plus-Minus (total)', decimals: 1, group: 'darko' },
  { key: 'odpm', label: 'O-DPM', title: 'DARKO offensive plus-minus', decimals: 1, group: 'darko' },
  { key: 'ddpm', label: 'D-DPM', title: 'DARKO defensive plus-minus', decimals: 1, group: 'darko' },

  { key: 'pts', label: 'PTS', title: 'Points per game', decimals: 1, group: 'box' },
  { key: 'trb', label: 'REB', title: 'Rebounds per game', decimals: 1, group: 'box' },
  { key: 'ast', label: 'AST', title: 'Assists per game', decimals: 1, group: 'box' },
  { key: 'stl', label: 'STL', title: 'Steals per game', decimals: 1, group: 'box' },
  { key: 'blk', label: 'BLK', title: 'Blocks per game', decimals: 1, group: 'box' },
  { key: 'tov', label: 'TOV', title: 'Turnovers per game', decimals: 1, group: 'box', higherBetter: false },
  { key: 'fgPct', label: 'FG%', title: 'Field-goal percentage', decimals: 1, percent: true, group: 'box' },
  { key: 'fg3Pct', label: '3P%', title: 'Three-point percentage', decimals: 1, percent: true, group: 'box' },
  { key: 'ftPct', label: 'FT%', title: 'Free-throw percentage', decimals: 1, percent: true, group: 'box' },

  { key: 'per', label: 'PER', title: 'Player Efficiency Rating', decimals: 1, group: 'advanced' },
  { key: 'tsPct', label: 'TS%', title: 'True Shooting percentage', decimals: 1, percent: true, group: 'advanced' },
  { key: 'usgPct', label: 'USG%', title: 'Usage rate', decimals: 1, percent: true, group: 'advanced' },
  { key: 'astPct', label: 'AST%', title: 'Assist percentage', decimals: 1, percent: true, group: 'advanced' },
  { key: 'trbPct', label: 'REB%', title: 'Total rebound percentage', decimals: 1, percent: true, group: 'advanced' },
  { key: 'tovPct', label: 'TOV%', title: 'Turnover percentage', decimals: 1, percent: true, group: 'advanced', higherBetter: false },

  { key: 'ws', label: 'WS', title: 'Win Shares', decimals: 1, group: 'value' },
  { key: 'ws48', label: 'WS/48', title: 'Win Shares per 48 minutes', decimals: 3, group: 'value' },
  { key: 'obpm', label: 'OBPM', title: 'Offensive Box Plus/Minus', decimals: 1, group: 'value' },
  { key: 'dbpm', label: 'DBPM', title: 'Defensive Box Plus/Minus', decimals: 1, group: 'value' },
  { key: 'bpm', label: 'BPM', title: 'Box Plus/Minus', decimals: 1, group: 'value' },
  { key: 'vorp', label: 'VORP', title: 'Value Over Replacement Player', decimals: 1, group: 'value' },
];
