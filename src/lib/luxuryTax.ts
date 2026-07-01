// ---------------------------------------------------------------------------
// Luxury-tax calculator.
//
// The luxury tax is the actual cash penalty an owner pays for a payroll above
// the tax line. It is charged on the amount over the line in progressive $5M
// bands, with the marginal rate rising the deeper a team goes — which is why
// apron-level payrolls carry enormous tax bills on top of the salaries
// themselves.
//
// These are the STANDARD (non-repeater) rates, estimated for planning. A
// "repeater" team (taxpayer in three of the prior four seasons) pays more.
// ---------------------------------------------------------------------------

interface Band {
  from: number; // dollars over the tax line where this band starts
  to: number;
  rate: number; // tax dollars per $1 of payroll in this band
}

const BASE_SCHEDULE: Band[] = [
  { from: 0, to: 5_000_000, rate: 1.5 },
  { from: 5_000_000, to: 10_000_000, rate: 1.75 },
  { from: 10_000_000, to: 15_000_000, rate: 2.5 },
  { from: 15_000_000, to: 20_000_000, rate: 3.25 },
  { from: 20_000_000, to: 25_000_000, rate: 3.75 },
  { from: 25_000_000, to: 30_000_000, rate: 4.25 },
  { from: 30_000_000, to: 35_000_000, rate: 4.75 },
];
const STEP = 5_000_000;
const RATE_STEP = 0.5;
/** Premium added to every band's rate for a repeater taxpayer (estimate). */
const REPEATER_PREMIUM = 1.0;

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

function bandLabel(from: number, to: number): string {
  return `$${(from / 1_000_000).toFixed(0)}–${(to / 1_000_000).toFixed(0)}M over`;
}

/** Build a schedule long enough to cover `over` dollars past the tax line. */
function scheduleFor(over: number): Band[] {
  const schedule = [...BASE_SCHEDULE];
  let from = 35_000_000;
  let rate = BASE_SCHEDULE[BASE_SCHEDULE.length - 1].rate + RATE_STEP; // 5.25
  while (over > from) {
    schedule.push({ from, to: from + STEP, rate });
    from += STEP;
    rate += RATE_STEP;
  }
  return schedule;
}

export function computeTax(
  salary: number,
  taxLine: number,
  repeater = false
): TaxResult {
  const over = Math.max(0, salary - taxLine);
  const premium = repeater ? REPEATER_PREMIUM : 0;
  const bands: TaxBand[] = [];
  let bill = 0;
  let marginalRate = 0;

  for (const b of scheduleFor(over)) {
    const rate = b.rate + premium;
    const used = Math.max(0, Math.min(over, b.to) - b.from);
    const cost = used * rate;
    if (used > 0) {
      bill += cost;
      marginalRate = rate;
    }
    bands.push({ label: bandLabel(b.from, b.to), rate, used, cost });
  }
  return { bill, over, marginalRate, bands };
}

/** The marginal tax rate that applies at a given payroll level. */
export function marginalRateAt(
  salary: number,
  taxLine: number,
  repeater = false
): number {
  return computeTax(salary + 1, taxLine, repeater).marginalRate;
}

/** The reference rate schedule (for showing the modifiers when under the tax). */
export const TAX_SCHEDULE_REFERENCE = BASE_SCHEDULE.map((b) => ({
  label: bandLabel(b.from, b.to),
  rate: b.rate,
}));
