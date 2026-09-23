// Final-score outcome models, with pushes.
//
// The first version of this app treated NFL margins as a smooth normal curve.
// That is fine far from the key numbers and badly wrong on them: a normal puts
// about 3% of games on any single integer, but NFL games land on exactly 3
// several times more often than that, and on 7 roughly twice as often. The
// difference is the push, and books price it — Ravens -3 at -125 and Ravens
// -3.5 at -110 are nearly the same bet, because the extra half-point is
// mostly buying out the chance of a push on 3.
//
// A push-blind model reads that -125 as "the Ravens are much better" and
// invents points of divergence that do not exist. So margins are modelled as
// a DISCRETE distribution over whole points: a normal shape around the
// expected margin, with extra weight on the numbers football actually
// clusters on. Every price conversion and every expected-value figure in the
// app goes through here, so a push is refunded wherever it can happen.

import { MARGIN_SIGMA, TOTAL_SIGMA } from './stats';

/**
 * Relative frequency multipliers on whole-point final margins.
 *
 * Approximate, and deliberately tunable in one place. Calibrated so that a
 * game priced near 3 lands on exactly 3 about 8% of the time and a game near
 * 7 lands on 7 about 5–6% of the time, in line with commonly cited NFL margin
 * frequencies. Everything unlisted is 1. Ties (0) are rare since overtime.
 */
const KEY_WEIGHT: Record<number, number> = {
  0: 0.1,
  3: 3.5,
  7: 2.2,
  10: 1.4,
  6: 1.4,
  4: 1.25,
  14: 1.25,
  1: 1.1,
};

const MARGIN_RANGE = 60;
const TOTAL_MAX = 110;

function marginWeight(k: number): number {
  return KEY_WEIGHT[Math.abs(k)] ?? 1;
}

/** Discrete distribution of home margin (home minus away) around mu. */
function marginPmf(mu: number): Float64Array {
  const pmf = new Float64Array(2 * MARGIN_RANGE + 1);
  let sum = 0;
  for (let k = -MARGIN_RANGE; k <= MARGIN_RANGE; k++) {
    const z = (k - mu) / MARGIN_SIGMA;
    const v = Math.exp(-0.5 * z * z) * marginWeight(k);
    pmf[k + MARGIN_RANGE] = v;
    sum += v;
  }
  for (let i = 0; i < pmf.length; i++) pmf[i] /= sum;
  return pmf;
}

/** Discrete distribution of combined score around mu. No key weights. */
function totalPmf(mu: number): Float64Array {
  const pmf = new Float64Array(TOTAL_MAX + 1);
  let sum = 0;
  for (let t = 0; t <= TOTAL_MAX; t++) {
    const z = (t - mu) / TOTAL_SIGMA;
    const v = Math.exp(-0.5 * z * z);
    pmf[t] = v;
    sum += v;
  }
  for (let i = 0; i < pmf.length; i++) pmf[i] /= sum;
  return pmf;
}

export interface Outcome {
  /** Probability the first-named side wins (home for spreads, over for totals). */
  win: number;
  push: number;
  /** Probability the other side wins. */
  lose: number;
}

/** Home side of a spread: home covers when margin + homePoint > 0. */
export function spreadOutcome(mu: number, homePoint: number): Outcome {
  const pmf = marginPmf(mu);
  let win = 0;
  let push = 0;
  let lose = 0;
  for (let k = -MARGIN_RANGE; k <= MARGIN_RANGE; k++) {
    const p = pmf[k + MARGIN_RANGE];
    const r = k + homePoint;
    if (Math.abs(r) < 1e-9) push += p;
    else if (r > 0) win += p;
    else lose += p;
  }
  return { win, push, lose };
}

/** Over side of a total: over wins when the combined score exceeds the point. */
export function totalOutcome(mu: number, point: number): Outcome {
  const pmf = totalPmf(mu);
  let win = 0;
  let push = 0;
  let lose = 0;
  for (let t = 0; t <= TOTAL_MAX; t++) {
    const p = pmf[t];
    const r = t - point;
    if (Math.abs(r) < 1e-9) push += p;
    else if (r > 0) win += p;
    else lose += p;
  }
  return { win, push, lose };
}

/** Win probability given no push — what a no-vig two-way price actually states. */
function conditional(o: Outcome): number {
  const d = o.win + o.lose;
  return d > 0 ? o.win / d : 0.5;
}

/** Bisection on a function that rises with its argument. Stable; results are memoized. */
function solve(f: (x: number) => number, target: number, lo: number, hi: number): number {
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Location vs expected margin.
//
// The weighted distribution is built around a location parameter, but with
// extra mass piled onto 3 and 7 its MEAN drifts away from that location, and
// the gap is largest right next to the key numbers. Left unconverted, two books
// either side of 3 would look further apart than they are: an even-money -3.5
// solves to a location of about 5 even though the expected margin it implies
// is much closer to 3.5. Everything this module exports speaks in expected
// margin, so a "point" means a point everywhere in the app.
// ---------------------------------------------------------------------------

function marginMean(location: number): number {
  const pmf = marginPmf(location);
  let m = 0;
  for (let k = -MARGIN_RANGE; k <= MARGIN_RANGE; k++) m += k * pmf[k + MARGIN_RANGE];
  return m;
}

function totalMean(location: number): number {
  const pmf = totalPmf(location);
  let m = 0;
  for (let t = 0; t <= TOTAL_MAX; t++) m += t * pmf[t];
  return m;
}

const locFromMarginMean = new Map<string, number>();
const locFromTotalMean = new Map<string, number>();

function marginLocation(mean: number): number {
  const key = mean.toFixed(4);
  const hit = locFromMarginMean.get(key);
  if (hit !== undefined) return hit;
  const loc = solve(marginMean, mean, -50, 50);
  locFromMarginMean.set(key, loc);
  return loc;
}

function totalLocation(mean: number): number {
  const key = mean.toFixed(4);
  const hit = locFromTotalMean.get(key);
  if (hit !== undefined) return hit;
  const loc = solve(totalMean, mean, 0, TOTAL_MAX);
  locFromTotalMean.set(key, loc);
  return loc;
}

/** Outcome of the home side at a line, given the EXPECTED home margin. */
export function spreadOutcomeAt(expectedMargin: number, homePoint: number): Outcome {
  return spreadOutcome(marginLocation(expectedMargin), homePoint);
}

/** Outcome of the over at a total, given the EXPECTED combined score. */
export function totalOutcomeAt(expectedTotal: number, point: number): Outcome {
  return totalOutcome(totalLocation(expectedTotal), point);
}

const marginMemo = new Map<string, number>();
const totalMemo = new Map<string, number>();

/**
 * Expected home margin implied by a no-vig home-cover probability at a line.
 * The probability is the one a two-way price states: win given no push.
 */
export function solveMarginMu(homePoint: number, pHomeNoPush: number): number {
  const key = `${homePoint}|${pHomeNoPush.toFixed(6)}`;
  const hit = marginMemo.get(key);
  if (hit !== undefined) return hit;
  const loc = solve((l) => conditional(spreadOutcome(l, homePoint)), pHomeNoPush, -45, 45);
  const mean = marginMean(loc);
  marginMemo.set(key, mean);
  return mean;
}

/** Expected combined score implied by a no-vig over probability at a total. */
export function solveTotalMu(point: number, pOverNoPush: number): number {
  const key = `${point}|${pOverNoPush.toFixed(6)}`;
  const hit = totalMemo.get(key);
  if (hit !== undefined) return hit;
  const loc = solve((l) => conditional(totalOutcome(l, point)), pOverNoPush, 5, 105);
  const mean = totalMean(loc);
  totalMemo.set(key, mean);
  return mean;
}

/** No-vig home probability (given no push) at a line, for an expected margin. */
export function fairHomeProb(expectedMargin: number, homePoint: number): number {
  return conditional(spreadOutcomeAt(expectedMargin, homePoint));
}

/** No-vig over probability (given no push) at a total, for an expected total. */
export function fairOverProb(expectedTotal: number, point: number): number {
  return conditional(totalOutcomeAt(expectedTotal, point));
}
