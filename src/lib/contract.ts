import type { ContractOption, Player } from '../types';
import { CURRENT_SEASON, SEASON_CAPS } from '../data/leagueConstants';

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

// Value-by-age curve (fraction of peak), modeled on public NBA aging research
// and DARKO's aging prior: value peaks ~26-27, declines gently to 30, then
// accelerates. Future-season value is scaled by the ratio of these factors.
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

/**
 * Fraction of current value a player retains `yearsOut` seasons from now. Uses
 * DARKO's own per-player retention curve (s1..s15) when supplied — real
 * player-specific aging — and falls back to the generic age curve otherwise.
 */
export function retentionFactor(
  currentAge: number,
  yearsOut: number,
  darkoDecline?: (number | null)[] | null
): number {
  const v = darkoDecline?.[yearsOut];
  if (v != null && Number.isFinite(v)) return v;
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
export function controlledSurplus(
  player: Player,
  from: number,
  value: number,
  darkoDecline?: (number | null)[] | null
): number {
  let total = 0;
  for (const cy of futureYears(player, from)) {
    if (CONTROL_ENDS(cy.option) || cy.salary <= 0) break;
    const k = cy.season - from;
    // Age the player's market value into each future season (value erodes as he
    // ages, per DARKO's own curve when available) and deflate that year's salary
    // by cap growth (a flat salary is a shrinking share of a rising cap),
    // keeping both in present-day dollars.
    const seasonValue = value * retentionFactor(player.age, k, darkoDecline);
    const realSalary = cy.salary / 1_000_000 / capGrowth(cy.season);
    const seasonSurplus = seasonValue - realSalary;
    const w = Math.pow(NPV_DISCOUNT, k); // NPV: discount future years to present
    if (cy.option === 'team') {
      total += w * Math.max(seasonSurplus, 0);
    } else if (cy.option === 'player' && k > 0) {
      total += w * Math.min(seasonSurplus, 0);
    } else {
      total += w * seasonSurplus;
    }
  }
  return total;
}
