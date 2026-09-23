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
//
// The conversion must model pushes. The first version assumed a smooth normal
// and ignored them, which is badly wrong on key numbers: Ravens -3 at -125 and
// Ravens -3.5 at -110 are nearly the same price because the half-point mostly
// buys out a push on 3, but the push-blind model read them 0.84 points apart
// and scored the difference as a 78. Conversion now goes through outcomes.ts.

import { median } from './stats';
import { solveMarginMu, solveTotalMu } from './outcomes';
import { bookOperator, bookTier, isMarketMaker } from './books';
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
 * A no-vig two-way price states the chance of winning GIVEN no push, so the
 * solve is done on that conditional probability against a push-aware
 * distribution of final margins.
 */
export function impliedMargin(spread: PricePair): number {
  return solveMarginMu(spread.homePoint, noVig(spread.homePrice, spread.awayPrice));
}

/** A book's total quote → the expected combined score it implies, in points. */
export function impliedTotal(total: TotalPair): number {
  return solveTotalMu(total.point, noVig(total.overPrice, total.underPrice));
}

/** A tier's consensus, as the median of its independent operators' numbers. */
export interface Consensus {
  /** Median implied expected margin (or total) across independent operators. */
  mu: number;
  /** Median posted line, for display — the number a bettor actually sees. */
  line: number;
  /** Independent operators contributing — sister brands count once. */
  count: number;
  /** Median hold, a sanity check on which shops we grouped together. */
  hold: number;
  /** Whether Pinnacle or Circa is part of it. */
  hasMarketMaker: boolean;
}

const EMPTY: Consensus = { mu: NaN, line: NaN, count: 0, hold: NaN, hasMarketMaker: false };

interface Row {
  book: string;
  mu: number;
  line: number;
  hold: number;
}

/**
 * Collapse sister brands to one row each, then take medians across operators.
 * Two keys quoting the same company's line would otherwise double its weight.
 */
function consensusOf(rows: Row[]): Consensus {
  if (rows.length === 0) return EMPTY;
  const byOp = new Map<string, Row[]>();
  for (const r of rows) {
    const op = bookOperator(r.book);
    byOp.set(op, [...(byOp.get(op) ?? []), r]);
  }
  const ops = [...byOp.values()].map((rs) => ({
    mu: median(rs.map((r) => r.mu)),
    line: median(rs.map((r) => r.line)),
    hold: median(rs.map((r) => r.hold)),
  }));
  return {
    mu: median(ops.map((o) => o.mu)),
    line: median(ops.map((o) => o.line)),
    count: ops.length,
    hold: median(ops.map((o) => o.hold)),
    hasMarketMaker: rows.some((r) => isMarketMaker(r.book)),
  };
}

/** Consensus spread read across the books in one tier. */
export function spreadConsensus(books: BookQuote[], tier: 'sharp' | 'retail'): Consensus {
  return consensusOf(
    books
      .filter((b) => bookTier(b.book) === tier && b.spread)
      .map((b) => ({
        book: b.book,
        mu: impliedMargin(b.spread!),
        line: b.spread!.homePoint,
        hold: hold(b.spread!.homePrice, b.spread!.awayPrice),
      }))
  );
}

/** Consensus total read across the books in one tier. */
export function totalConsensus(books: BookQuote[], tier: 'sharp' | 'retail'): Consensus {
  return consensusOf(
    books
      .filter((b) => bookTier(b.book) === tier && b.total)
      .map((b) => ({
        book: b.book,
        mu: impliedTotal(b.total!),
        line: b.total!.point,
        hold: hold(b.total!.overPrice, b.total!.underPrice),
      }))
  );
}

/** Look up one game in a snapshot's game list. */
export function findGame(games: GameQuote[], id: string): GameQuote | undefined {
  return games.find((g) => g.id === id);
}
