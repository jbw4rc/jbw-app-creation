// The signal engine.
//
// Five independent reads on one game. Each returns a side and a strength from
// 0 to 1; each carries a fixed weight, and the weights sum to 100. Signals that
// agree add up, signals that disagree cancel — so the final Sharp Score is not
// "how loud is the loudest signal" but "how much does the evidence agree".
// A game where every read points the same way outranks a game with one big
// move and three reads pointing back the other way. That is the ranking you
// want: corroboration, not noise.

import { clamp, median } from './stats';
import { spreadConsensus, totalConsensus, findGame } from './market';
import type { Consensus } from './market';
import type { GameQuote, Market, OddsHistory, Side, Snapshot } from '../types';

/** Weights, in points of Sharp Score. Tune here; nothing else reads them. */
export const WEIGHTS = {
  divergence: 30,
  reverseMove: 25,
  steam: 18,
  juiceMove: 15,
  keyNumber: 12,
} as const;

export type SignalId = keyof typeof WEIGHTS;

/** A move smaller than this is drift, however fast it happened. */
const STEAM_MIN_MOVE = 0.35;
/** Points per hour that counts as a full-strength steam move. */
const STEAM_FULL_RATE = 0.12;

export interface Signal {
  id: SignalId;
  label: string;
  /** Plain-English reading, written for a bettor, not a quant. */
  detail: string;
  /** Which side this read points at; null when the signal is neutral. */
  side: Side | null;
  /** 0..1 before weighting. */
  strength: number;
  /** Signed contribution to the score: positive = home/over. */
  points: number;
  /** False when the data needed for this read is missing. */
  available: boolean;
}

export interface MarketRead {
  market: Market;
  /** Sharp-book consensus now. */
  sharp: Consensus;
  /** Retail consensus now. */
  retail: Consensus;
  /** Sharp consensus at the first snapshot we have (the "open" we can see). */
  openMu: number;
  openLine: number;
  /** Total movement in the sharp number since then, in points. */
  moveMu: number;
  signals: Signal[];
  /** 0..100. */
  score: number;
  /** Side the weight of evidence points at; null when signals cancel out. */
  sharpSide: Side | null;
  /** Side the public is on, inferred from retail shading. */
  squareSide: Side | null;
  /** Sum of the weights we could actually compute. */
  coverage: number;
}

export interface GameRead {
  id: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  spread: MarketRead;
  total: MarketRead;
  /** The stronger of the two markets, for slate ranking. */
  best: MarketRead;
}

/** Positive score means home/over; map that to a side name per market. */
function sideOf(signed: number, market: Market): Side | null {
  if (Math.abs(signed) < 1e-9) return null;
  if (market === 'spread') return signed > 0 ? 'home' : 'away';
  return signed > 0 ? 'over' : 'under';
}

/** Consensus for one tier in one market. */
function consensus(game: GameQuote, market: Market, tier: 'sharp' | 'retail'): Consensus {
  return market === 'spread'
    ? spreadConsensus(game.books, tier)
    : totalConsensus(game.books, tier);
}

/** NFL spreads cluster on these; buying through one costs a book real money. */
const KEY_NUMBERS = [3, 7, 6, 10, 4, 14];

/**
 * Did the line cross a key number, and how much does that cost?
 * Crossing 3 is the single most expensive move a book can make — about 10%
 * of NFL games land exactly on 3. A book does not go from -2.5 to -3.5
 * because of a few square parlays.
 */
function keyNumberCross(from: number, to: number): { key: number; weight: number } | null {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (const key of KEY_NUMBERS) {
    for (const k of [key, -key]) {
      if (lo < k && hi > k) {
        const w = k === 3 || k === -3 ? 1 : k === 7 || k === -7 ? 0.8 : 0.5;
        return { key: Math.abs(k), weight: w };
      }
    }
  }
  return null;
}

/** Per-market label for a side, e.g. "Chiefs" or "Over". */
export function sideLabel(side: Side | null, game: { homeTeam: string; awayTeam: string }): string {
  if (side === 'home') return game.homeTeam;
  if (side === 'away') return game.awayTeam;
  if (side === 'over') return 'Over';
  if (side === 'under') return 'Under';
  return '—';
}

/** Signed points toward home/over, given a side and magnitude. */
function signed(side: Side | null, magnitude: number): number {
  if (side === 'home' || side === 'over') return magnitude;
  if (side === 'away' || side === 'under') return -magnitude;
  return 0;
}

/** A line as a bettor reads it: spreads carry a sign, totals do not. */
function lineText(value: number, market: Market): string {
  if (!Number.isFinite(value)) return '—';
  if (market === 'total') return `${value}`;
  return value > 0 ? `+${value}` : `${value}`;
}

function buildMarketRead(
  history: Snapshot[],
  gameId: string,
  market: Market
): MarketRead | null {
  const latest = history[history.length - 1];
  const game = findGame(latest.games, gameId);
  if (!game) return null;

  const sharp = consensus(game, market, 'sharp');
  const retail = consensus(game, market, 'retail');

  // --- Opening number: the earliest snapshot that priced this game. ---
  let openMu = NaN;
  let openLine = NaN;
  for (const snap of history) {
    const g = findGame(snap.games, gameId);
    if (!g) continue;
    const c = consensus(g, market, 'sharp');
    if (Number.isFinite(c.mu)) {
      openMu = c.mu;
      openLine = c.line;
      break;
    }
  }

  const moveMu = Number.isFinite(sharp.mu) && Number.isFinite(openMu) ? sharp.mu - openMu : NaN;
  const signals: Signal[] = [];

  // ---------------------------------------------------------------
  // 1. Sharp vs retail divergence — where the public is, and isn't.
  // ---------------------------------------------------------------
  {
    const has = Number.isFinite(sharp.mu) && Number.isFinite(retail.mu) && retail.count > 0;
    const gap = has ? sharp.mu - retail.mu : 0;
    const side = sideOf(gap, market);
    const strength = has ? clamp(Math.abs(gap) / 1.5, 0, 1) : 0;
    const square = sideOf(-gap, market);
    signals.push({
      id: 'divergence',
      label: 'Sharp vs retail split',
      detail: has
        ? Math.abs(gap) < 0.1
          ? 'Sharp and retail books agree — no shading to read here.'
          : `Retail books are ${Math.abs(gap).toFixed(2)} pts worse on ${sideLabel(square, game)}, ` +
            `which is the side they are protecting against. That is where the public money is.`
        : 'No retail books quoted — cannot read the shade.',
      side,
      strength,
      points: signed(side, WEIGHTS.divergence * strength),
      available: has,
    });
  }

  const divergenceSide = signals[0].side;
  const divergenceStrength = signals[0].strength;

  // ---------------------------------------------------------------
  // 2. Reverse line movement — the line moves off the public side.
  // ---------------------------------------------------------------
  {
    const has = Number.isFinite(moveMu) && history.length > 1;
    const moveSide = has ? sideOf(moveMu, market) : null;
    // A real RLM needs both a move and a public side to move against.
    const agrees = moveSide !== null && moveSide === divergenceSide;
    const strength =
      has && agrees
        ? clamp(Math.abs(moveMu) / 1.5, 0, 1) * clamp(divergenceStrength / 0.33, 0, 1)
        : 0;
    signals.push({
      id: 'reverseMove',
      label: 'Reverse line movement',
      detail: !has
        ? 'Not enough line history yet to see movement.'
        : agrees && strength > 0.05
          ? `The number moved ${Math.abs(moveMu).toFixed(2)} pts toward ${sideLabel(moveSide, game)} — ` +
            `away from the side the public is on. Books do not move against their own hold by accident.`
          : moveSide
            ? `Moved ${Math.abs(moveMu).toFixed(2)} pts toward ${sideLabel(moveSide, game)}, the same side ` +
              `the public is on. That is ordinary public drift, not a sharp move.`
            : 'The number has not moved.',
      side: agrees ? moveSide : null,
      strength,
      points: signed(agrees ? moveSide : null, WEIGHTS.reverseMove * strength),
      available: has,
    });
  }

  // ---------------------------------------------------------------
  // 3. Steam — a fast move, measured per HOUR, not per poll.
  //    This has to be rate-based. We poll a handful of times a day, so
  //    consecutive snapshots can sit 24 hours apart; a line that drifts a
  //    quarter-point overnight would otherwise look identical to one that
  //    got hit for a full point in twenty minutes. Only the second is steam.
  // ---------------------------------------------------------------
  {
    let bestRate = 0;
    let bestStep = 0;
    let bestAt = '';
    let prevMu: number | null = null;
    let prevAt = 0;
    for (const snap of history) {
      const g = findGame(snap.games, gameId);
      if (!g) continue;
      const c = consensus(g, market, 'sharp');
      if (!Number.isFinite(c.mu)) continue;
      const at = new Date(snap.takenAt).getTime();
      if (prevMu !== null && at > prevAt) {
        const step = c.mu - prevMu;
        const hours = (at - prevAt) / 3_600_000;
        const rate = Math.abs(step) / Math.max(hours, 0.25);
        // Gate on absolute size too: a tiny wiggle between two close polls
        // is a high rate but not a move anyone fired.
        if (Math.abs(step) >= STEAM_MIN_MOVE && rate > bestRate) {
          bestRate = rate;
          bestStep = step;
          bestAt = snap.takenAt;
        }
      }
      prevMu = c.mu;
      prevAt = at;
    }
    const has = history.length > 1;
    const fired = bestAt !== '';
    const side = fired ? sideOf(bestStep, market) : null;
    const strength = fired ? clamp(bestRate / STEAM_FULL_RATE, 0, 1) : 0;
    signals.push({
      id: 'steam',
      label: 'Steam move',
      detail: !has
        ? 'Not enough line history yet to see a steam move.'
        : fired
          ? `${Math.abs(bestStep).toFixed(2)} pts on ${sideLabel(side, game)} in one window ` +
            `(${bestRate.toFixed(2)} pts/hr). A move that fast is one group firing at once, ` +
            `not the public trickling in.`
          : 'No sudden jumps — this line has drifted rather than moved.',
      side,
      strength,
      points: signed(side, WEIGHTS.steam * strength),
      available: has,
    });
  }

  // ---------------------------------------------------------------
  // 4. Juice moving while the posted number sits still.
  //    The tell everyone misses: -3 never becomes -3.5, but the price
  //    walks -110 → -120 → -125. That is money, quietly.
  // ---------------------------------------------------------------
  {
    const has = Number.isFinite(moveMu) && Number.isFinite(openLine) && history.length > 1;
    const lineStuck = has && Math.abs(sharp.line - openLine) < 0.01;
    const strength = lineStuck ? clamp(Math.abs(moveMu) / 0.5, 0, 1) : 0;
    const side = lineStuck ? sideOf(moveMu, market) : null;
    signals.push({
      id: 'juiceMove',
      label: 'Price move, line stuck',
      detail: !has
        ? 'Not enough line history yet to compare price against line.'
        : !lineStuck
          ? `The posted number itself moved (${lineText(openLine, market)} → ` +
            `${lineText(sharp.line, market)}), so the story is in the line, not the juice.`
          : strength > 0.1
            ? `The number is frozen at ${lineText(sharp.line, market)} but the price has walked ` +
              `${Math.abs(moveMu).toFixed(2)} pts toward ${sideLabel(side, game)}. Books are charging ` +
              `more for that side rather than give up the number.`
            : 'Number and price have both held still.',
      side,
      strength,
      points: signed(side, WEIGHTS.juiceMove * strength),
      available: has,
    });
  }

  // ---------------------------------------------------------------
  // 5. Key numbers — 3 and 7 are expensive to cross.
  // ---------------------------------------------------------------
  {
    const has = market === 'spread' && Number.isFinite(openLine) && Number.isFinite(sharp.line);
    const cross = has ? keyNumberCross(openLine, sharp.line) : null;
    // Line is quoted home-negative, so a drop means the move is toward home.
    const side = cross ? sideOf(openLine - sharp.line, market) : null;
    const strength = cross ? cross.weight : 0;
    signals.push({
      id: 'keyNumber',
      label: 'Key number bought',
      detail:
        market !== 'spread'
          ? 'Key numbers apply to spreads, not totals.'
          : !has
            ? 'Not enough line history yet.'
            : cross
              ? `The line was bought through ${cross.key} toward ${sideLabel(side, game)}. ` +
                `${cross.key === 3 ? 'Roughly one NFL game in ten lands exactly on 3 — ' +
                  'a book gives that number up only when it has to.' :
                  'Books resist crossing this number; crossing it says the money forced them.'}`
              : `No key number crossed — the line has stayed between them.`,
      side,
      strength,
      points: signed(side, WEIGHTS.keyNumber * strength),
      available: has,
    });
  }

  const net = signals.reduce((sum, s) => sum + s.points, 0);
  const coverage = signals.filter((s) => s.available).reduce((sum, s) => sum + WEIGHTS[s.id], 0);
  const sharpSide = sideOf(net, market);
  const squareSide =
    divergenceSide === null
      ? null
      : market === 'spread'
        ? divergenceSide === 'home'
          ? 'away'
          : 'home'
        : divergenceSide === 'over'
          ? 'under'
          : 'over';

  return {
    market,
    sharp,
    retail,
    openMu,
    openLine,
    moveMu,
    signals,
    score: clamp(Math.abs(net), 0, 100),
    sharpSide,
    squareSide,
    coverage,
  };
}

/**
 * The read for one game, as it stood at the END of the snapshots handed in.
 *
 * Pass a truncated history and you get the board exactly as the app would have
 * shown it at that moment. That is what makes closing-line value measurable:
 * we can replay what the engine said at each poll and then check what the
 * market did afterwards.
 */
export function readGameAt(snapshots: Snapshot[], gameId: string): GameRead | null {
  if (snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const game = findGame(latest.games, gameId);
  if (!game) return null;

  const spread = buildMarketRead(snapshots, gameId, 'spread');
  const total = buildMarketRead(snapshots, gameId, 'total');
  if (!spread || !total) return null;

  return {
    id: game.id,
    commenceTime: game.commenceTime,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    spread,
    total,
    best: spread.score >= total.score ? spread : total,
  };
}

/** Build the full read for every game on the board, ranked strongest first. */
export function readSlate(history: OddsHistory): GameRead[] {
  const snaps = history.snapshots;
  if (snaps.length === 0) return [];
  const latest = snaps[snaps.length - 1];

  const reads: GameRead[] = [];
  for (const game of latest.games) {
    const read = readGameAt(snaps, game.id);
    if (read) reads.push(read);
  }
  reads.sort((a, b) => b.best.score - a.best.score);
  return reads;
}

/** Score at or above which a game is called a strong sharp side. */
export const STRONG_MIN = 45;
/** Score at or above which a game is worth calling a lean — and worth grading. */
export const LEAN_MIN = 22;

/**
 * How to read a score, in words.
 *
 * The thresholds are calibrated to what the engine can actually produce, not to
 * the theoretical 100. Even a loud game rarely clears 65: a 1.5-point sharp/
 * retail gap (full divergence credit) basically never happens, so in practice a
 * strong game looks like 0.8 pts of shade plus a clean reverse move through a
 * key number. If "strong" were set at 80 the label would never appear, which
 * would make it useless.
 */
export function scoreBand(score: number): { label: string; tone: 'strong' | 'lean' | 'noise' } {
  if (score >= STRONG_MIN) return { label: 'Strong sharp side', tone: 'strong' };
  if (score >= LEAN_MIN) return { label: 'Sharp lean', tone: 'lean' };
  return { label: 'No clear edge', tone: 'noise' };
}

/** Median hold across a set of books — used to sanity-check tiering in the UI. */
export function medianHold(values: number[]): number {
  return median(values.filter((v) => Number.isFinite(v)));
}
