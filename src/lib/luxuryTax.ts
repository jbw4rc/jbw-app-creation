// ---------------------------------------------------------------------------
// Luxury-tax calculator.
//
// The luxury tax is the actual cash penalty an owner pays for a payroll above
// the tax line. It is charged on the amount over the line in progressive
// brackets, with the marginal rate rising the deeper a team goes.
//
// The bracket width and the Standard vs Repeater rate arrays are the exact
// figures SalarySwish publishes for the season (see seededTax.ts, auto-pulled
// daily) — reproducing their bills to the dollar. Beyond the published
// brackets the rate keeps rising +0.5× per bracket. A "repeater" (taxpayer in
// three of the prior four seasons) pays the steeper schedule.
// ---------------------------------------------------------------------------

import { SEEDED_TAX } from '../data/seededTax';

export interface TaxBand {
  label: string;
  rate: number;
  /** Dollars of payroll falling in this band. */
  used: number;
  /** Tax cost from this band. */
  cost: number;
}

export interface TaxResult {
  /** Total estimated luxury-tax bill. */
  bill: number;
  /** Amount of payroll over the tax line (0 if under). */
  over: number;
  /** The marginal rate at the team's payroll level (0 if under the tax). */
  marginalRate: number;
  bands: TaxBand[];
}

const m1 = (n: number) => {
  const v = n / 1_000_000;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

/** Rate for the i-th bracket, extrapolating +0.5× beyond the published set. */
function rateFor(rates: number[], i: number): number {
  if (i < rates.length) return rates[i];
  return rates[rates.length - 1] + 0.5 * (i - (rates.length - 1));
}

export function computeTax(
  salary: number,
  taxLine: number,
  repeater = false
): TaxResult {
  const over = Math.max(0, salary - taxLine);
  const width = SEEDED_TAX.bracketWidth;
  const rates = repeater ? SEEDED_TAX.repeater : SEEDED_TAX.standard;

  const bands: TaxBand[] = [];
  let bill = 0;
  let marginalRate = 0;
  for (let i = 0; over - i * width > 0; i++) {
    const from = i * width;
    const used = Math.min(over - from, width);
    const rate = rateFor(rates, i);
    const cost = used * rate;
    bill += cost;
    marginalRate = rate;
    bands.push({ label: `$${m1(from)}–${m1(from + width)}M over`, rate, used, cost });
  }
  return { bill: Math.round(bill), over, marginalRate, bands };
}

/** The marginal tax rate that applies at a given payroll level. */
export function marginalRateAt(
  salary: number,
  taxLine: number,
  repeater = false
): number {
  return computeTax(salary + 1, taxLine, repeater).marginalRate;
}

/** Reference (standard) rate schedule, for showing the modifiers when under the tax. */
export const TAX_SCHEDULE_REFERENCE = SEEDED_TAX.standard.map((rate, i) => ({
  label: `$${m1(i * SEEDED_TAX.bracketWidth)}–${m1((i + 1) * SEEDED_TAX.bracketWidth)}M over`,
  rate,
}));
