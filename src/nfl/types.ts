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
  snapshots: Snapshot[];
}

/** Which market a read applies to. */
export type Market = 'spread' | 'total';

/** Which side a signal points at. */
export type Side = 'home' | 'away' | 'over' | 'under';
