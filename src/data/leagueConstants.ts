import type { SeasonCap } from '../types';

// ---------------------------------------------------------------------------
// League salary-cap thresholds.
//
// 2024-25 and 2025-26 use the league's officially announced figures. Seasons
// after that are PROJECTED using the CBA's maximum 10% year-over-year cap
// increase (the "smoothing" ceiling), which is the realistic planning
// assumption while the new national-TV deal ramps up. All figures are in
// whole dollars.
//
// Sources: NBA official cap releases for 2024-25 and 2025-26.
// ---------------------------------------------------------------------------

/** The first (current) season the app reasons about. */
export const CURRENT_SEASON = 2024;

/** Number of seasons in the planning horizon (current + next four). */
export const HORIZON = 5;

export const SEASON_CAPS: SeasonCap[] = [
  {
    season: 2024,
    projected: false,
    salaryCap: 140_588_000,
    luxuryTax: 170_814_000,
    firstApron: 178_132_000,
    secondApron: 188_931_000,
    nonTaxpayerMLE: 12_822_000,
    taxpayerMLE: 5_168_000,
    biAnnualException: 4_667_000,
    minTeamSalary: 126_529_000,
  },
  {
    season: 2025,
    projected: false,
    salaryCap: 154_647_000,
    luxuryTax: 187_895_000,
    firstApron: 195_945_000,
    secondApron: 207_824_000,
    nonTaxpayerMLE: 14_104_000,
    taxpayerMLE: 5_685_000,
    biAnnualException: 5_134_000,
    minTeamSalary: 139_182_000,
  },
  // --- Projected seasons (max 10% cap growth) ---
  {
    season: 2026,
    projected: true,
    salaryCap: 170_112_000,
    luxuryTax: 206_685_000,
    firstApron: 215_540_000,
    secondApron: 228_606_000,
    nonTaxpayerMLE: 15_514_000,
    taxpayerMLE: 6_254_000,
    biAnnualException: 5_647_000,
    minTeamSalary: 153_100_000,
  },
  {
    season: 2027,
    projected: true,
    salaryCap: 187_123_000,
    luxuryTax: 227_354_000,
    firstApron: 237_094_000,
    secondApron: 251_467_000,
    nonTaxpayerMLE: 17_065_000,
    taxpayerMLE: 6_879_000,
    biAnnualException: 6_212_000,
    minTeamSalary: 168_411_000,
  },
  {
    season: 2028,
    projected: true,
    salaryCap: 205_835_000,
    luxuryTax: 250_089_000,
    firstApron: 260_803_000,
    secondApron: 276_614_000,
    nonTaxpayerMLE: 18_772_000,
    taxpayerMLE: 7_567_000,
    biAnnualException: 6_833_000,
    minTeamSalary: 185_252_000,
  },
];

/** The seasons, in order, that the app plans across. */
export const SEASONS: number[] = SEASON_CAPS.map((c) => c.season);

const capBySeason = new Map<number, SeasonCap>(
  SEASON_CAPS.map((c) => [c.season, c])
);

export function getSeasonCap(season: number): SeasonCap {
  const cap = capBySeason.get(season);
  if (!cap) {
    throw new Error(`No cap data for season ${season}`);
  }
  return cap;
}
