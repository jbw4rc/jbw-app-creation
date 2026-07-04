import type { ContractOption, Player } from '../types';
import { CURRENT_SEASON, SEASON_CAPS } from '../data/leagueConstants';
import { AGING_COEFFS, AGING_PEAK_AGE } from '../data/agingCurve';

// ---------------------------------------------------------------------------
// Contract term + cost-control valuation.
//
// Trade value isn't just this season: teams covet long, cost-controlled assets
// and shun long bad money. This module reads a player's multi-year contract to
// (a) describe its remaining term/option and (b) value the surplus a team keeps
// over the years it controls the player, in PRESENT-DAY dollars:
//   - future salaries are deflated by cap growth (a flat salary is a shrinking
//     share of a rising cap, so it gets relatively cheaper each year), and
//   - the whole surplus is NPV-discounted (teams value this year over future).
// ---------------------------------------------------------------------------

const CONTROL_ENDS = (o: ContractOption) => o === 'ufa' || o === 'rfa';

/** Net-present-value discount per year out (time preference). Shared with picks. */
export const NPV_DISCOUNT = 0.9;
const HORIZON = 8;

// Salary-cap by season (for deflating future salaries to present-cap dollars),
// extrapolated past the known table at the CBA's ~10%/yr ceiling.
const CAP_GROWTH_BEYOND = 1.1;
const capBySeason = new Map(SEASON_CAPS.map((c) => [c.season, c.salaryCap]));
const KNOWN = SEASON_CAPS.map((c) => c.season);
const LAST_KNOWN = Math.max(...KNOWN);

function salaryCapFor(season: number): number {
  const known = capBySeason.get(season);
  if (known) return known;
  // Extrapolate forward from the last known cap.
  const base = capBySeason.get(LAST_KNOWN)!;
  return base * Math.pow(CAP_GROWTH_BEYOND, season - LAST_KNOWN);
}

/** How much the cap has grown by `season` relative to the current season (≥1). */
export function capGrowth(season: number): number {
  return salaryCapFor(season) / salaryCapFor(CURRENT_SEASON);
}

// Fallback value-by-age curve (fraction of peak) for when age/DPM are unknown.
// Modeled on public NBA aging research: value peaks ~26-27, declines gently to
// 30, then accelerates. Superseded by the empirical DARKO curve below whenever
// we have the player's age + current DPM.
const AGE_VALUE: Record<number, number> = {
  19: 0.55, 20: 0.65, 21: 0.74, 22: 0.82, 23: 0.89, 24: 0.94, 25: 0.98,
  26: 1.0, 27: 1.0, 28: 0.97, 29: 0.93, 30: 0.88, 31: 0.81, 32: 0.73,
  33: 0.63, 34: 0.52, 35: 0.41, 36: 0.31, 37: 0.22, 38: 0.15, 39: 0.1,
};

function ageValue(age: number): number {
  const a = Math.max(19, Math.min(39, Math.round(age)));
  return AGE_VALUE[a];
}

/**
 * Multiplier on a player's current market value `k` seasons out, from aging.
 * Scales by the age curve's ratio; the modest youth upside is capped so a very
 * young player isn't wildly inflated over a long projection.
 */
export function ageFactor(currentAge: number, yearsOut: number): number {
  if (!currentAge) return 1; // unknown age -> no adjustment
  const f = ageValue(currentAge + yearsOut) / ageValue(currentAge);
  return Math.min(1.25, f);
}

// --- Talent-aware aging curve (DARKO DPM career histories) --------------------
// For each age we fit  Δdpm = alpha(age) + beta(age)*dpm  by weighted least
// squares over consecutive-season pairs (see scripts/build-aging-curve.mjs).
// alpha = a typical player's yearly change at that age; beta = the talent slope
// (extra change per point of current DPM). We project a player forward by
// iterating that recursion with HIS OWN current DPM — so a high-talent young
// player develops more than a fringe one, and stars mean-revert, straight from
// the data (no hand-set tiers). Value then scales ~linearly with DPM above
// replacement, so the projected DPM converts to a value-retention multiplier.
const REPLACEMENT_DPM = -2.0;   // DARKO replacement level (~pts/100 poss)
const MIN_LEVEL = 2.5;          // denom floor so fringe players don't swing wildly
const RETENTION_CAP = 1.6;      // safety clamp on youth appreciation
const RETENTION_FLOOR = 0.05;
const DPM_CLAMP = [-4, 12];     // keep the forward recursion in a sane range

const COEFF_LO = AGING_COEFFS[0].age;
const COEFF_HI = AGING_COEFFS[AGING_COEFFS.length - 1].age;
const COEFF_BY_AGE = new Map(AGING_COEFFS.map((c) => [c.age, c]));

/** Project a player's DPM `years` seasons forward from (age, dpm) via the recursion. */
function projectDpm(startAge: number, startDpm: number, years: number): number {
  let d = startDpm;
  const a0 = Math.round(startAge);
  for (let a = a0; a < a0 + years; a++) {
    const c = COEFF_BY_AGE.get(Math.max(COEFF_LO, Math.min(COEFF_HI, a)));
    d += (c?.alpha ?? 0) + (c?.beta ?? 0) * d;
    d = Math.max(DPM_CLAMP[0], Math.min(DPM_CLAMP[1], d));
  }
  return d;
}

/**
 * Talent-aware DPM shift from aging: how much a player's DPM is expected to move
 * from now to `yearsOut` seasons out, given his current DPM. Positive for
 * developing (usually young, high-talent) players, negative for decline.
 */
export function agingDpmDelta(currentAge: number, yearsOut: number, dpm = 0): number {
  if (!currentAge || yearsOut <= 0) return 0;
  return projectDpm(currentAge, dpm, yearsOut) - dpm;
}

/**
 * Fraction of current value a player retains `yearsOut` seasons from now.
 *
 * With age + DPM we project the player forward on the talent-aware curve and
 * convert the DPM change to a value multiplier (retention can exceed 1 for a
 * developing player). Pre-peak players take the more optimistic of that and
 * DARKO's own retention; peak/post-peak players keep DARKO's player-specific
 * decline curve (s1..s15) when supplied, else the projection, else the age curve.
 */
export function retentionFactor(
  currentAge: number,
  yearsOut: number,
  darkoDecline?: (number | null)[] | null,
  dpm?: number | null
): number {
  if (yearsOut <= 0) return 1;
  const dk = darkoDecline?.[yearsOut];
  const dkOk = dk != null && Number.isFinite(dk);
  if (currentAge && dpm != null && Number.isFinite(dpm)) {
    // Value scales ~linearly with DPM above replacement, floored so fringe
    // players (near-zero value above replacement) don't swing wildly. Floor both
    // ends so the ratio stays monotonic in projected DPM.
    const projected = projectDpm(currentAge, dpm, yearsOut);
    const vNow = Math.max(dpm - REPLACEMENT_DPM, MIN_LEVEL);
    const vThen = Math.max(projected - REPLACEMENT_DPM, MIN_LEVEL);
    const emp = Math.max(RETENTION_FLOOR, Math.min(RETENTION_CAP, vThen / vNow));
    // Pre-peak: take the more optimistic of the projection and DARKO (DARKO's
    // s-curve caps at 1.0 and misses youth appreciation). Post-peak: prefer
    // DARKO's player-specific decline when supplied, else the projection.
    if (currentAge < AGING_PEAK_AGE) return dkOk ? Math.max(emp, dk) : emp;
    return dkOk ? dk : emp;
  }
  // Age or DPM unknown: DARKO's decline curve, then the generic age curve.
  if (dkOk) return dk;
  return ageFactor(currentAge, yearsOut);
}

export interface ContractTerm {
  /** Last season the team controls (salary > 0, not UFA/RFA); null if none. */
  through: number | null;
  /** Option type on that final controlled year. */
  endOption: ContractOption | null;
  /** Number of controlled seasons counting from `from`. */
  years: number;
  /** Compact chip, e.g. "'30", "'28 PO", "'29 TO", "exp". */
  label: string;
}

function twoDigit(calendarYear: number): string {
  return `'${String(calendarYear).slice(2)}`;
}

/** Contract entries from `from` forward, in season order (tolerates data gaps). */
function futureYears(player: Player, from: number) {
  return player.contract
    .filter((c) => c.season >= from && c.season < from + HORIZON)
    .sort((a, b) => a.season - b.season);
}

/** Remaining term/option for a player, viewed from season `from`. */
export function contractTerm(player: Player, from: number): ContractTerm {
  let years = 0;
  let through: number | null = null;
  let endOption: ContractOption | null = null;
  for (const cy of futureYears(player, from)) {
    // A missing intermediate season is a data gap, not the end of control; only
    // an explicit UFA/RFA (or a $0 non-option year) actually ends the deal.
    if (CONTROL_ENDS(cy.option) || cy.salary <= 0) break;
    years++;
    through = cy.season;
    endOption = cy.option;
  }

  let label: string;
  if (years <= 1 || through == null) {
    label = 'exp';
  } else {
    // The season "2029" is 2029-30; the deal's end (FA) year is that + 1.
    const suffix =
      endOption === 'player'
        ? ' PO'
        : endOption === 'team'
          ? ' TO'
          : endOption === 'nonGuaranteed'
            ? ' NG'
            : '';
    label = `${twoDigit(through + 1)}${suffix}`;
  }
  return { through, endOption, years, label };
}

/**
 * Surplus ($M) a team keeps over the years it controls the player, holding his
 * market value flat and discounting future years. Options are priced by who
 * holds them: team options keep only positive years, player options leave the
 * team only the negative ones (the player opts out of the good ones).
 */
/** One controlled season's value math, in present-day $M (for "show the math"). */
export interface SurplusYear {
  season: number;
  option: ContractOption;
  /** Aging retention factor applied to value this season. */
  retention: number;
  /** Aged market value, $M. */
  agedValue: number;
  /** Contract salary that season, $M (nominal). */
  salaryNominal: number;
  /** Cap growth vs the current season. */
  capGrowth: number;
  /** Salary deflated to present-day dollars, $M. */
  salaryReal: number;
  /** agedValue − salaryReal, $M. */
  surplus: number;
  /** Surplus after the option rule (team keeps upside, player keeps downside). */
  effective: number;
  /** NPV discount factor for this season. */
  npv: number;
  /** effective × npv — what this season adds to the total, $M. */
  contribution: number;
}

/** Per-season value breakdown over the years a team controls the player. */
export function surplusBreakdown(
  player: Player,
  from: number,
  value: number,
  darkoDecline?: (number | null)[] | null,
  dpm?: number | null
): SurplusYear[] {
  const rows: SurplusYear[] = [];
  for (const cy of futureYears(player, from)) {
    if (CONTROL_ENDS(cy.option) || cy.salary <= 0) break;
    const k = cy.season - from;
    // Age the player's market value into each future season (young players may
    // appreciate on the empirical curve; veterans erode per DARKO's own curve)
    // and deflate that year's salary by cap growth (a flat salary is a shrinking
    // share of a rising cap), keeping both in present-day dollars.
    const retention = retentionFactor(player.age, k, darkoDecline, dpm);
    const agedValue = value * retention;
    const salaryNominal = cy.salary / 1_000_000;
    const cg = capGrowth(cy.season);
    const salaryReal = salaryNominal / cg;
    const surplus = agedValue - salaryReal;
    let effective = surplus;
    if (cy.option === 'team') effective = Math.max(surplus, 0);
    else if (cy.option === 'player' && k > 0) effective = Math.min(surplus, 0);
    const npv = Math.pow(NPV_DISCOUNT, k); // discount future years to present
    rows.push({
      season: cy.season,
      option: cy.option,
      retention,
      agedValue,
      salaryNominal,
      capGrowth: cg,
      salaryReal,
      surplus,
      effective,
      npv,
      contribution: effective * npv,
    });
  }
  return rows;
}

/** Total controlled surplus, $M — the sum of the per-season breakdown. */
export function controlledSurplus(
  player: Player,
  from: number,
  value: number,
  darkoDecline?: (number | null)[] | null,
  dpm?: number | null
): number {
  return surplusBreakdown(player, from, value, darkoDecline, dpm).reduce(
    (s, r) => s + r.contribution,
    0
  );
}
