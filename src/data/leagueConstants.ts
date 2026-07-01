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

/**
 * The season the roster/contract sample data is authored against — the first
 * array entry of every contract is this season. Kept separate from
 * CURRENT_SEASON so the focal/summary year can move without shifting the data.
 */
export const DATA_START_SEASON = 2024;

/** The focal season the summary and machines reason about (2026-27). */
export const CURRENT_SEASON = 2026;

/** Number of seasons in the forward planning horizon (current + next four). */
export const HORIZON = 5;

/**
 * When the bundled sample rosters were last touched, and whether they reflect
 * verified real data or illustrative sample data. Flip `verified` to true and
 * bump `asOf` once real rosters are baked in.
 */
export const BUNDLED_ROSTERS = {
  asOf: '2026-07-01T16:41:00-04:00',
  verified: false,
};

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
  // 2026-27: set figures (first/second apron per Spotrac); cap & tax derived
  // from the same 1.0667x step off the official 2025-26 lines.
  {
    season: 2026,
    projected: false,
    salaryCap: 164_962_000,
    luxuryTax: 200_428_000,
    firstApron: 209_015_000,
    secondApron: 221_686_000,
    nonTaxpayerMLE: 15_045_000,
    taxpayerMLE: 6_064_000,
    biAnnualException: 5_476_000,
    minTeamSalary: 148_466_000,
  },
  // --- Projected seasons (~7% cap growth off the 2026-27 baseline) ---
  {
    season: 2027,
    projected: true,
    salaryCap: 176_509_000,
    luxuryTax: 214_458_000,
    firstApron: 223_646_000,
    secondApron: 237_204_000,
    nonTaxpayerMLE: 16_098_000,
    taxpayerMLE: 6_488_000,
    biAnnualException: 5_859_000,
    minTeamSalary: 158_859_000,
  },
  {
    season: 2028,
    projected: true,
    salaryCap: 188_865_000,
    luxuryTax: 229_470_000,
    firstApron: 239_301_000,
    secondApron: 253_808_000,
    nonTaxpayerMLE: 17_225_000,
    taxpayerMLE: 6_942_000,
    biAnnualException: 6_269_000,
    minTeamSalary: 169_979_000,
  },
  {
    season: 2029,
    projected: true,
    salaryCap: 202_086_000,
    luxuryTax: 245_533_000,
    firstApron: 256_052_000,
    secondApron: 271_575_000,
    nonTaxpayerMLE: 18_431_000,
    taxpayerMLE: 7_428_000,
    biAnnualException: 6_708_000,
    minTeamSalary: 181_878_000,
  },
  {
    season: 2030,
    projected: true,
    salaryCap: 216_232_000,
    luxuryTax: 262_720_000,
    firstApron: 273_976_000,
    secondApron: 290_585_000,
    nonTaxpayerMLE: 19_721_000,
    taxpayerMLE: 7_948_000,
    biAnnualException: 7_178_000,
    minTeamSalary: 194_609_000,
  },
];

/** The five seasons, in order, that the app plans across (2025-26 → 2029-30). */
export const SEASONS: number[] = Array.from(
  { length: HORIZON },
  (_, i) => CURRENT_SEASON + i
);

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
