// Shared domain types for the sharp-money tracker.
//
// The shape here mirrors what scripts/build-odds.mjs commits: a flat series of
// timestamped snapshots of the NFL board. Everything the app shows — movement,
// steam, reverse line moves — is derived by diffing snapshots, so the snapshot
// series IS the database. There is no server.

/** A two-way price pair as posted by one book for one market. */
export interface PricePair {
  /** Points from the home team's perspective: -3 means home favored by 3. */
  homePoint: number;
  homePrice: number;
  awayPoint: number;
  awayPrice: number;
}

/** A total as posted by one book. */
export interface TotalPair {
  point: number;
  overPrice: number;
  underPrice: number;
}

/** One book's board for one game at one moment. */
export interface BookQuote {
  book: string;
  spread?: PricePair;
  total?: TotalPair;
  moneyline?: { homePrice: number; awayPrice: number };
}

/** One game at one moment. */
export interface GameQuote {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  books: BookQuote[];
}

/** The whole board at one moment. */
export interface Snapshot {
  /** ISO timestamp of the poll. */
  takenAt: string;
  games: GameQuote[];
}

/** The committed history, newest snapshot last. */
export interface OddsHistory {
  /** ISO timestamp of the most recent poll. */
  updatedAt: string;
  /** True when these are synthetic sample rows, not a live pull. */
  sample: boolean;
  /** NFL week these games belong to, when known. */
  week: number | null;
  season: number | null;
  /** The Odds API credit balance as of the latest poll, when known. */
  quota?: { used: number; remaining: number; at: string };
  snapshots: Snapshot[];
}

/** Which market a read applies to. */
export type Market = 'spread' | 'total';

/** Which side a signal points at. */
export type Side = 'home' | 'away' | 'over' | 'under';

// ---------------------------------------------------------------------------
// Closing-line value archive.
//
// A snapshot series is pruned once its games kick off, so before that happens
// each finished game is boiled down to a resolution record: what the engine
// said, when it said it, and where the market ended up. That record is what
// lets the app grade its own signals instead of just asserting them.
// ---------------------------------------------------------------------------

/** What the engine said about one market at one poll. */
export interface ReadPoint {
  takenAt: string;
  score: number;
  side: Side | null;
  /** Sharp-consensus implied margin/total at that moment. */
  mu: number;
  /** Sharp-consensus posted line at that moment. */
  line: number;
}

/** One market of a finished game, graded against the close. */
export interface ResolvedMarket {
  market: Market;
  /** The engine's read at every poll, oldest first. */
  reads: ReadPoint[];
  /** Implied margin/total at the last poll before kickoff. */
  closingMu: number;
  closingLine: number;
  /** The first poll at which the score cleared the lean band, if it ever did. */
  flaggedAt: string | null;
  flaggedSide: Side | null;
  flaggedScore: number;
  /** Null when the market never cleared the lean band. */
  flaggedMu: number | null;
  flaggedLine: number | null;
  /**
   * Points the market moved TOWARD the flagged side after it was flagged.
   * Positive means the number you would have taken beat the close.
   */
  clv: number | null;
}

/** A finished game, archived for grading. */
export interface ResolvedGame {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  spread: ResolvedMarket;
  total: ResolvedMarket;
}

/** The committed archive of graded games. */
export interface ClvArchive {
  /** Null until the first game has been archived. */
  updatedAt: string | null;
  /** True when these rows were generated rather than observed. */
  sample: boolean;
  games: ResolvedGame[];
}
