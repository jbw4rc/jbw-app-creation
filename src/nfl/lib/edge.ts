// What to actually bet, at the books you actually have.
//
// The Sharp Score measures how far apart sharp and retail books are. That is
// not the same as an edge you can take: you can only bet the prices on offer at
// your own books, and a big gap can be almost fully paid for by a half-point.
// Ravens/Cowboys scored 78 on a gap that was worth 23 cents per $100 at
// DraftKings — and once pushes were modelled, the gap itself vanished.
//
// So this treats the sharp consensus as the fair price and asks, for every
// side at every book you have selected: if the sharp number is right, what is
// this bet worth? A push refunds the stake wherever one can happen.

import { spreadOutcomeAt, totalOutcomeAt } from './outcomes';
import type { Outcome } from './outcomes';
import type { GameRead, MarketRead } from './sharp';
import type { BookQuote, GameQuote, Market, Side } from '../types';

/** Expected value, in dollars per $100 staked, that earns a "bet" verdict. */
export const BET_MIN_EV = 2.0;
/** Below this there is nothing worth mentioning. Between the two: thin. */
export const THIN_MIN_EV = 0.5;
/** Fewer independent sharp operators than this and the "fair price" is one opinion. */
export const MIN_SHARP_BOOKS = 2;

export interface BetOption {
  book: string;
  market: Market;
  side: Side;
  /** The number as the bettor sees it for their side (e.g. -3.5, +7, 44.5). */
  line: number;
  price: number;
  win: number;
  push: number;
  lose: number;
  /** Dollars won or lost on average per $100 staked. */
  ev: number;
  /** Worst American price at which this bet still clears BET_MIN_EV. */
  playableTo: number | null;
}

export type Verdict = 'bet' | 'thin' | 'pass';

export interface Recommendation {
  verdict: Verdict;
  best: BetOption | null;
  /** Every option at the selected books, best first. */
  options: BetOption[];
  /** One plain sentence explaining the verdict. */
  reason: string;
}

/** Profit on a winning $100 stake at American odds. */
export function payout(american: number): number {
  return american > 0 ? american : 10000 / -american;
}

/** American odds that pay `profit` on a $100 stake. */
export function toAmerican(profit: number): number {
  return profit >= 100 ? Math.round(profit) : -Math.round(10000 / profit);
}

/** EV per $100 of a bet with these outcome probabilities at this price. */
export function evPer100(o: Outcome, price: number): number {
  return o.win * payout(price) - o.lose * 100;
}

/** Worst price that still clears a target EV, or null if no price could. */
export function priceForEv(o: Outcome, targetEv: number): number | null {
  if (o.win <= 0) return null;
  const needed = (targetEv + 100 * o.lose) / o.win;
  return needed > 0 ? toAmerican(needed) : null;
}

function reversed(o: Outcome): Outcome {
  return { win: o.lose, push: o.push, lose: o.win };
}

function option(
  book: string,
  market: Market,
  side: Side,
  line: number,
  price: number,
  o: Outcome
): BetOption {
  return {
    book,
    market,
    side,
    line,
    price,
    win: o.win,
    push: o.push,
    lose: o.lose,
    ev: evPer100(o, price),
    playableTo: priceForEv(o, BET_MIN_EV),
  };
}

/** Both sides of one market at one book, priced against the sharp fair value. */
export function optionsAtBook(quote: BookQuote, read: MarketRead): BetOption[] {
  const fair = read.sharp.mu;
  if (!Number.isFinite(fair)) return [];

  if (read.market === 'spread' && quote.spread) {
    const q = quote.spread;
    const home = spreadOutcomeAt(fair, q.homePoint);
    // Away covers exactly when home fails to at the mirrored number.
    const away = reversed(spreadOutcomeAt(fair, -q.awayPoint));
    return [
      option(quote.book, 'spread', 'home', q.homePoint, q.homePrice, home),
      option(quote.book, 'spread', 'away', q.awayPoint, q.awayPrice, away),
    ];
  }
  if (read.market === 'total' && quote.total) {
    const q = quote.total;
    const over = totalOutcomeAt(fair, q.point);
    return [
      option(quote.book, 'total', 'over', q.point, q.overPrice, over),
      option(quote.book, 'total', 'under', q.point, q.underPrice, reversed(over)),
    ];
  }
  return [];
}

function describe(o: BetOption, game: { homeTeam: string; awayTeam: string }): string {
  return `${betLabel(o, game)} (${o.price > 0 ? '+' : ''}${o.price})`;
}

/** "Ravens -3.5" / "Cowboys +3.5" / "Over 44.5" — the bet as it reads on a slip. */
export function betLabel(o: BetOption, game: { homeTeam: string; awayTeam: string }): string {
  if (o.market === 'total') return `${o.side === 'over' ? 'Over' : 'Under'} ${o.line}`;
  const team = (o.side === 'home' ? game.homeTeam : game.awayTeam).split(' ').pop();
  const pts = Math.abs(o.line) < 1e-9 ? 'PK' : o.line > 0 ? `+${o.line}` : `${o.line}`;
  return `${team} ${pts}`;
}

/**
 * The call for one game at the selected books, across both markets.
 *
 * Deliberately blunt. It prices every side at every book against the sharp
 * consensus and takes the best; it does not consult the Sharp Score. The score
 * describes where the money went. This describes whether what is left on the
 * board is worth betting — and most of the time it is not.
 */
export function recommend(
  read: GameRead,
  quote: GameQuote | undefined,
  books: string[]
): Recommendation {
  if (books.length === 0) {
    return { verdict: 'pass', best: null, options: [], reason: 'Pick your books to see bets.' };
  }
  const mine = (quote?.books ?? []).filter((b) => books.includes(b.book));
  if (mine.length === 0) {
    return { verdict: 'pass', best: null, options: [], reason: 'None of your books are pricing this game.' };
  }

  const options: BetOption[] = [];
  for (const read_ of [read.spread, read.total]) {
    if (read_.sharp.count < MIN_SHARP_BOOKS) continue;
    for (const b of mine) options.push(...optionsAtBook(b, read_));
  }
  if (options.length === 0) {
    return {
      verdict: 'pass',
      best: null,
      options,
      reason: 'Too few sharp books are pricing this game to trust a fair value.',
    };
  }

  options.sort((a, b) => b.ev - a.ev);
  const best = options[0];
  const money = `${best.ev >= 0 ? '+' : '−'}$${Math.abs(best.ev).toFixed(2)} per $100`;
  const fairFrom = best.market === 'spread' ? read.spread.sharp : read.total.sharp;

  if (best.ev >= BET_MIN_EV) {
    // A bet needs the fair price to include an actual market-maker. Without
    // Pinnacle or Circa it rests on secondary books, and every false "bet" on
    // the first cut of this engine was exactly that.
    if (!fairFrom.hasMarketMaker) {
      return {
        verdict: 'thin',
        best,
        options,
        reason:
          `${describe(best, read)} prices at ${money}, but neither Pinnacle nor Circa is ` +
          `quoting it — the fair price is secondary books only, so not a bet.`,
      };
    }
    return { verdict: 'bet', best, options, reason: `${describe(best, read)} is worth ${money} against the sharp price.` };
  }
  if (best.ev >= THIN_MIN_EV) {
    return {
      verdict: 'thin',
      best,
      options,
      reason: `Best available is ${describe(best, read)} at ${money} — positive, but inside the margin of error.`,
    };
  }
  return {
    verdict: 'pass',
    best,
    options,
    reason: `No edge at your books. Best available is ${describe(best, read)} at ${money}.`,
  };
}
