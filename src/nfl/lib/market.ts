// Turning posted prices into one comparable number per book.
//
// The problem: DraftKings at -2.5 (-120) and Pinnacle at -3 (-105) are nearly
// the same price, but the raw numbers look different, and "who has the better
// line" is not obvious by eye. Comparing juice alone is worse — a half-point
// through 3 is worth far more than a half-point through 9.
//
// The fix: strip the vig, then ask what expected margin would make that book's
// fair probability correct. Every book collapses to a single number — its
// implied expected home margin, in points. Now two books are directly
// comparable no matter what line or juice each of them posted.

import { MARGIN_SIGMA, TOTAL_SIGMA, normalCdf, normalQuantile, median } from './stats';
import { bookTier } from './books';
import type { BookQuote, GameQuote, PricePair, TotalPair } from '../types';

/** American odds → implied probability (vig included). */
export function impliedProb(american: number): number {
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

/** Strip the vig from a two-way market, returning the fair probability of A. */
export function noVig(priceA: number, priceB: number): number {
  const a = impliedProb(priceA);
  const b = impliedProb(priceB);
  const sum = a + b;
  return sum > 0 ? a / sum : 0.5;
}

/** American odds → the book's total margin ("hold") on a two-way market. */
export function hold(priceA: number, priceB: number): number {
  return impliedProb(priceA) + impliedProb(priceB) - 1;
}

/**
 * A book's spread quote → the expected home margin it implies, in points.
 *
 * Home covers when margin > -homePoint. Given the book's fair cover
 * probability p, we solve Normal(mu, sigma) for the mu that produces it.
 * A book posting home -3 at even money implies mu = 3.0; shading the price
 * to -120 on the home side implies it really thinks mu is a bit above 3.
 */
export function impliedMargin(spread: PricePair): number {
  const p = noVig(spread.homePrice, spread.awayPrice);
  return -spread.homePoint - MARGIN_SIGMA * normalQuantile(1 - p);
}

/** A book's total quote → the expected total it implies, in points. */
export function impliedTotal(total: TotalPair): number {
  const p = noVig(total.overPrice, total.underPrice);
  return total.point + TOTAL_SIGMA * normalQuantile(p);
}

/** Probability the home team covers a given spread, at an expected margin. */
export function coverProb(mu: number, homePoint: number): number {
  return 1 - normalCdf((-homePoint - mu) / MARGIN_SIGMA);
}

/** Probability a game goes over a given total, at an expected total. */
export function overProb(mu: number, point: number): number {
  return 1 - normalCdf((point - mu) / TOTAL_SIGMA);
}

/** A tier's consensus, as the median of its books' implied numbers. */
export interface Consensus {
  /** Median implied expected margin (or total) across the books in the tier. */
  mu: number;
  /** Median posted line, for display — the number a bettor actually sees. */
  line: number;
  /** How many books contributed. */
  count: number;
  /** Median hold, a sanity check on which shops we grouped together. */
  hold: number;
}

const EMPTY: Consensus = { mu: NaN, line: NaN, count: 0, hold: NaN };

/** Consensus spread read across the books in one tier. */
export function spreadConsensus(books: BookQuote[], tier: 'sharp' | 'retail'): Consensus {
  const rows = books.filter((b) => bookTier(b.book) === tier && b.spread);
  if (rows.length === 0) return EMPTY;
  return {
    mu: median(rows.map((r) => impliedMargin(r.spread!))),
    line: median(rows.map((r) => r.spread!.homePoint)),
    count: rows.length,
    hold: median(rows.map((r) => hold(r.spread!.homePrice, r.spread!.awayPrice))),
  };
}

/** Consensus total read across the books in one tier. */
export function totalConsensus(books: BookQuote[], tier: 'sharp' | 'retail'): Consensus {
  const rows = books.filter((b) => bookTier(b.book) === tier && b.total);
  if (rows.length === 0) return EMPTY;
  return {
    mu: median(rows.map((r) => impliedTotal(r.total!))),
    line: median(rows.map((r) => r.total!.point)),
    count: rows.length,
    hold: median(rows.map((r) => hold(r.total!.overPrice, r.total!.underPrice))),
  };
}

/** Look up one game in a snapshot's game list. */
export function findGame(games: GameQuote[], id: string): GameQuote | undefined {
  return games.find((g) => g.id === id);
}
