/**
 * Every business rule the dashboard applies, in one editable place.
 *
 * These are ASSUMED values for the mockup. Each one is surfaced in the UI next
 * to the indicator it drives, so the numbers can be argued with directly rather
 * than living inside a formula.
 */

import type { RfrStep } from '../types';

/** Target days in each Request-for-Reimbursement process step (indicator 2). */
export const RFR_STEP_TARGETS: Record<RfrStep, number> = {
  Submitted: 3,
  'Recipient Review': 10,
  'Documentation Review': 14,
  'Fiscal Review': 10,
  'FEMA Review': 21,
  'Payment Processing': 7,
  Paid: 0,
};

export const RFR_STEP_ORDER: RfrStep[] = [
  'Submitted',
  'Recipient Review',
  'Documentation Review',
  'Fiscal Review',
  'FEMA Review',
  'Payment Processing',
  'Paid',
];

/** Large-project validation targets (indicator 3). */
export const VALIDATION = {
  /** Days after obligation by which validation should be complete. */
  targetDaysPostObligation: 180,
  /** Share of obligated funds that may remain unvalidated before it flags. */
  maxUnvalidatedShare: 0.25,
};

/** Closeout timing rules (indicator 11). */
export const CLOSEOUT = {
  /** Days after period-of-performance end that closeout must complete within. */
  daysAfterPop: 180,
  /** Lead time before the +180 deadline at which we want the extension filed. */
  warnLeadDays: 90,
};

/** Aging bands applied to any "days over target" measure. */
export const AGING_BANDS = [
  { key: 'within', label: 'Within target', max: 1.0 },
  { key: 'over1', label: '1–1.5× target', max: 1.5 },
  { key: 'over2', label: '1.5–2× target', max: 2.0 },
  { key: 'over3', label: '> 2× target', max: Infinity },
] as const;

export type AgingBandKey = (typeof AGING_BANDS)[number]['key'];

export function agingBand(days: number, target: number): AgingBandKey {
  if (target <= 0) return 'within';
  const ratio = days / target;
  if (ratio <= 1) return 'within';
  if (ratio <= 1.5) return 'over1';
  if (ratio <= 2) return 'over2';
  return 'over3';
}

/** How many items the team can realistically work in a planning period. */
export const CAPACITY = {
  validationsPerMonth: 12,
  closeoutsPerMonth: 18,
};

/** Deadline horizon buckets, shared by indicators 4 and 11. */
export const HORIZON_BUCKETS = [
  { key: 'past', label: 'Past due', lo: -Infinity, hi: 0 },
  { key: 'd30', label: 'Within 30 days', lo: 0, hi: 30 },
  { key: 'd60', label: '30–60 days', lo: 30, hi: 60 },
  { key: 'd90', label: '60–90 days', lo: 60, hi: 90 },
  { key: 'later', label: 'Beyond 90 days', lo: 90, hi: Infinity },
] as const;

export type HorizonKey = (typeof HORIZON_BUCKETS)[number]['key'];

export function horizonBucket(daysUntil: number): HorizonKey {
  for (const b of HORIZON_BUCKETS) {
    if (daysUntil >= b.lo && daysUntil < b.hi) return b.key;
  }
  return 'later';
}
