import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { TEAMS } from '../data/teams';
import { playerSalaryForSeason } from './apron';
import { darkoFor } from './darko';

// ---------------------------------------------------------------------------
// Projected free-agent contract model.
//
// There's no reachable feed of projected FA contracts, so we FIT one on real
// data: every rostered player's actual salary, joined to his DARKO market value,
// DPM and age, is a live snapshot of how the league pays players. A ridge
// regression on value + age + DPM learns that mapping, which we then apply to
// free agents to estimate what each would actually command.
//
// Rookie-scale deals are excluded from training — they're cost-controlled, not
// market outcomes, and would teach the model that high-value players are cheap.
// Predictions are clamped to the CBA min and an age-based max.
// ---------------------------------------------------------------------------

const cap = getSeasonCap(CURRENT_SEASON);
const MIN_SALARY_M = 2.3; // 2026-27 vet minimum, $M
const RIDGE = 0.5; // regularization (stabilizes value/DPM collinearity)

/** Max salary ($M) a player of a given age can earn (25/30/35% of cap tiers). */
function maxForAge(age: number): number {
  const pct = age >= 30 ? 0.35 : age >= 25 ? 0.3 : 0.25;
  return (cap.salaryCap * pct) / 1_000_000;
}

// Feature vector. DARKO value (itself derived from DPM) is the production signal;
// adding DPM separately is collinear and destabilizes the fit. Age enters as an
// INTERACTION with value (value × age-deviation), not additively, so a low-value
// player can't be inflated by age alone — the interaction vanishes as value → 0.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function features(value: number, age: number, _dpm: number): number[] {
  return [value, (value * (age - 27)) / 10];
}

interface Sample {
  x: number[];
  y: number; // salary $M
}

// --- Training set: veteran (non-rookie-scale) rostered contracts -------------
function buildSamples(): Sample[] {
  const samples: Sample[] = [];
  for (const t of TEAMS) {
    for (const p of t.players) {
      if (p.twoWay) continue;
      const salary = playerSalaryForSeason(p, CURRENT_SEASON) / 1_000_000;
      if (salary <= 0) continue;
      // Skip rookie-scale deals — not market contracts.
      if (/rsc|rookie/i.test(p.signedUsing ?? '')) continue;
      const d = darkoFor(p.name);
      if (!d || d.value == null || d.dpm == null) continue;
      const age = d.age ?? p.age;
      if (!age) continue;
      samples.push({ x: features(d.value, age, d.dpm), y: salary });
    }
  }
  return samples;
}

// --- Ridge least squares (normal equations, Gaussian elimination) ------------
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col] || 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / d;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-9));
}

function fit(samples: Sample[]) {
  // No intercept: a zero-value, zero-production player should price near $0
  // (then clamp to the minimum), not inherit an "average veteran" floor.
  const k = samples[0].x.length;
  const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty = new Array(k).fill(0);
  let sumY = 0;
  for (const { x, y } of samples) {
    sumY += y;
    for (let a = 0; a < k; a++) {
      Xty[a] += x[a] * y;
      for (let b = 0; b < k; b++) XtX[a][b] += x[a] * x[b];
    }
  }
  for (let i = 0; i < k; i++) XtX[i][i] += RIDGE; // ridge on all features
  const beta = solve(XtX, Xty);

  // R² for transparency.
  const meanY = sumY / samples.length;
  let ssRes = 0;
  let ssTot = 0;
  for (const { x, y } of samples) {
    const pred = beta.reduce((s, b, i) => s + b * x[i], 0);
    ssRes += (y - pred) ** 2;
    ssTot += (y - meanY) ** 2;
  }
  return { beta, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, n: samples.length };
}

const MODEL = (() => {
  const samples = buildSamples();
  if (samples.length < 30) return { beta: [1, 0], r2: 0, n: samples.length };
  return fit(samples);
})();

/** Model prediction (uncapped), $M. */
function rawSalary(value: number, age: number, dpm: number): number {
  const x = features(value, age, dpm);
  return MODEL.beta.reduce((s, b, i) => s + b * x[i], 0);
}

export interface ContractProjection {
  /** Projected annual salary, $M (clamped to min / age-max). */
  salary: number;
  /** Raw model output before clamping, $M. */
  raw: number;
  /** True if the clamp (min or max) bound the estimate. */
  bounded: 'min' | 'max' | null;
}

/**
 * Projected annual contract ($M) for a player, from the fitted market model.
 * `value` and `dpm` are DARKO figures; `age` in years.
 */
export function projectedContract(value: number, age: number, dpm: number): ContractProjection {
  const raw = rawSalary(value, age, dpm);
  const max = maxForAge(age);
  let salary = raw;
  let bounded: 'min' | 'max' | null = null;
  if (salary < MIN_SALARY_M) {
    salary = MIN_SALARY_M;
    bounded = 'min';
  } else if (salary > max) {
    salary = max;
    bounded = 'max';
  }
  return { salary, raw, bounded };
}

/** Model diagnostics for display (fit quality + sample size). */
export const CONTRACT_MODEL_INFO = { r2: MODEL.r2, n: MODEL.n };
