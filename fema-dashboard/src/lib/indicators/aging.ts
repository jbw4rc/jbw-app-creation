/**
 * Archetype B — aging against a target (indicators 2, 3, 11).
 *
 * The shared idea: there is a clock and a target, and management needs to see
 * the difference between "one record is stuck" and "this step is broken."
 */

import type { Dataset, ExceptionRow, IndicatorDefinition, Project, RfrStep, Severity } from '../../types';
import { AGING_BANDS, CLOSEOUT, RFR_STEP_ORDER, RFR_STEP_TARGETS, VALIDATION, agingBand } from '../../config/thresholds';
import { addDays, daysBetween, weekStart } from '../dates';
import { bucketHorizon, closeoutDeadline } from './reconciliation';

/* ------------------------------------------------- 2. RFRs aging in a step */

export interface StepSummary {
  step: RfrStep;
  target: number;
  count: number;
  dollars: number;
  bands: Record<string, { count: number; dollars: number }>;
  medianDays: number;
  p90Days: number;
}

export interface RfrResult {
  rows: ExceptionRow[];
  steps: StepSummary[];
  inFlightCount: number;
  inFlightDollars: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function computeRfrAging(ds: Dataset): RfrResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const rows: ExceptionRow[] = [];
  const inFlight = ds.rfrs.filter((r) => r.step !== 'Paid');

  const steps: StepSummary[] = RFR_STEP_ORDER.filter((s) => s !== 'Paid').map((step) => {
    const target = RFR_STEP_TARGETS[step];
    const members = inFlight.filter((r) => r.step === step);
    const ages = members.map((r) => daysBetween(r.stepEnteredOn, ds.asOf)).sort((a, b) => a - b);
    const bands: StepSummary['bands'] = {};
    for (const b of AGING_BANDS) bands[b.key] = { count: 0, dollars: 0 };
    for (const r of members) {
      const age = daysBetween(r.stepEnteredOn, ds.asOf);
      const key = agingBand(age, target);
      bands[key].count += 1;
      bands[key].dollars += r.amount;
    }
    return {
      step,
      target,
      count: members.length,
      dollars: members.reduce((s, r) => s + r.amount, 0),
      bands,
      medianDays: Math.round(quantile(ages, 0.5)),
      p90Days: Math.round(quantile(ages, 0.9)),
    };
  });

  for (const r of inFlight) {
    const target = RFR_STEP_TARGETS[r.step];
    const age = daysBetween(r.stepEnteredOn, ds.asOf);
    if (age <= target) continue;

    const band = agingBand(age, target);
    const severity: Severity = band === 'over3' ? 'critical' : band === 'over2' ? 'serious' : 'warning';
    const applicant = applicantsById.get(r.applicantId)!;

    rows.push({
      id: r.id,
      indicator: 'rfr-aging',
      entity: r.id,
      entityDetail: `${r.step} · ${r.projectIds.length} project${r.projectIds.length === 1 ? '' : 's'}`,
      projectId: r.projectIds[0] ?? null,
      accountId: r.accountId,
      applicantName: applicant.name,
      disasterId: r.disasterId,
      severity,
      ageDays: age,
      dollars: r.amount,
      nextAction: `${age - target} days past the ${target}-day target for ${r.step} — escalate to the step owner`,
      detectedOn: addDays(r.stepEnteredOn, target),
      detail: [
        { label: 'Current step', value: r.step },
        { label: 'Days in step', value: `${age} (target ${target})` },
        { label: 'Entered step on', value: r.stepEnteredOn },
        { label: 'Submitted on', value: r.submittedOn },
        { label: 'Total cycle time to date', value: `${daysBetween(r.submittedOn, ds.asOf)} days` },
        { label: 'Projects on this RFR', value: r.projectIds.join(', ') },
      ],
    });
  }

  return {
    rows,
    steps,
    inFlightCount: inFlight.length,
    inFlightDollars: inFlight.reduce((s, r) => s + r.amount, 0),
  };
}

/* ------------------------------------------- 3. Large project validation */

export interface ValidationPoint {
  project: Project;
  daysPostObligation: number;
  unvalidatedShare: number;
  unvalidatedDollars: number;
  flagDays: boolean;
  flagShare: boolean;
}

export interface ValidationResult {
  rows: ExceptionRow[];
  points: ValidationPoint[];
  portfolioObligated: number;
  portfolioValidated: number;
}

export function computeValidation(ds: Dataset): ValidationResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const rows: ExceptionRow[] = [];
  const points: ValidationPoint[] = [];

  let portfolioObligated = 0;
  let portfolioValidated = 0;

  for (const p of ds.projects) {
    if (p.size !== 'Large' || !p.obligatedOn || p.obligatedAmount <= 0) continue;
    if (p.femaStatus === 'Withdrawn') continue;

    portfolioObligated += p.obligatedAmount;
    portfolioValidated += p.validatedAmount;

    const unvalidatedDollars = Math.max(0, p.obligatedAmount - p.validatedAmount);
    if (unvalidatedDollars <= 0) continue;

    const daysPostObligation = daysBetween(p.obligatedOn, ds.asOf);
    const unvalidatedShare = unvalidatedDollars / p.obligatedAmount;
    const flagDays = daysPostObligation > VALIDATION.targetDaysPostObligation;
    const flagShare = unvalidatedShare > VALIDATION.maxUnvalidatedShare;

    points.push({ project: p, daysPostObligation, unvalidatedShare, unvalidatedDollars, flagDays, flagShare });
    if (!flagDays && !flagShare) continue;

    const severity: Severity = flagDays && flagShare ? 'critical' : flagDays ? 'serious' : 'warning';
    const applicant = applicantsById.get(p.applicantId)!;

    rows.push({
      id: `VAL-${p.id}`,
      indicator: 'large-project-validation',
      entity: p.id,
      entityDetail: `Cat ${p.category} · ${p.title}`,
      projectId: p.id,
      accountId: p.accountId,
      applicantName: applicant.name,
      disasterId: p.disasterId,
      severity,
      ageDays: daysPostObligation,
      dollars: unvalidatedDollars,
      nextAction:
        flagDays && flagShare
          ? 'Schedule validation now — both the timing and the unvalidated-share targets are breached'
          : flagDays
            ? `${daysPostObligation - VALIDATION.targetDaysPostObligation} days past the ${VALIDATION.targetDaysPostObligation}-day validation target`
            : `${Math.round(unvalidatedShare * 100)}% of funds still unvalidated against a ${Math.round(VALIDATION.maxUnvalidatedShare * 100)}% ceiling`,
      detectedOn: addDays(p.obligatedOn, VALIDATION.targetDaysPostObligation),
      detail: [
        { label: 'Obligated', value: `$${p.obligatedAmount.toLocaleString()}` },
        { label: 'Validated to date', value: `$${p.validatedAmount.toLocaleString()}` },
        { label: 'Unvalidated', value: `$${unvalidatedDollars.toLocaleString()} (${Math.round(unvalidatedShare * 100)}%)` },
        { label: 'Obligated on', value: p.obligatedOn },
        { label: 'Days post-obligation', value: `${daysPostObligation} (target ${VALIDATION.targetDaysPostObligation})` },
        { label: 'Period of performance ends', value: p.popEndDate },
      ],
    });
  }

  return { rows, points, portfolioObligated, portfolioValidated };
}

/* ------------------------------------------- 11. Closeout time extensions */

export interface CliffPoint {
  weekStart: string;
  crossingCount: number;
  crossingDollars: number;
  cumulativeCount: number;
  cumulativeDollars: number;
}

export interface CloseoutExtensionResult {
  rows: ExceptionRow[];
  cliff: CliffPoint[];
  horizon: Array<{ key: string; count: number; dollars: number }>;
}

export function computeCloseoutExtensions(ds: Dataset): CloseoutExtensionResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const rows: ExceptionRow[] = [];
  const crossings: Array<{ date: string; dollars: number }> = [];

  for (const p of ds.projects) {
    // Only projects that remain open and carry no manually-tracked extension.
    if (p.femaStatus !== 'Open' || p.sorStatus === 'Closed') continue;
    if (p.closeoutExtensionOnFile) continue;

    const deadline = closeoutDeadline(p);
    const daysUntil = daysBetween(ds.asOf, deadline);
    crossings.push({ date: deadline, dollars: p.obligatedAmount });

    // Only surface what needs action inside the lead-time window.
    if (daysUntil > CLOSEOUT.warnLeadDays) continue;

    const severity: Severity = daysUntil < 0 ? 'critical' : daysUntil <= 30 ? 'serious' : 'warning';
    const applicant = applicantsById.get(p.applicantId)!;

    rows.push({
      id: `CTE-${p.id}`,
      indicator: 'closeout-extensions',
      entity: p.id,
      entityDetail: `Cat ${p.category} · ${p.title}`,
      projectId: p.id,
      accountId: p.accountId,
      applicantName: applicant.name,
      disasterId: p.disasterId,
      severity,
      ageDays: daysUntil < 0 ? -daysUntil : null,
      dollars: p.obligatedAmount,
      nextAction:
        daysUntil < 0
          ? `Closeout deadline passed ${-daysUntil} days ago — file a closeout extension or close the project`
          : `Closeout deadline in ${daysUntil} days — file an extension or drive it to closeout`,
      detectedOn: addDays(deadline, -CLOSEOUT.warnLeadDays),
      detail: [
        { label: 'PoP end', value: p.popEndDate },
        { label: `Closeout deadline (PoP + ${CLOSEOUT.daysAfterPop}d)`, value: deadline },
        { label: 'Days remaining', value: String(daysUntil) },
        { label: 'Closeout extension on file', value: 'No' },
        { label: 'Extensions granted to date', value: String(p.extensionsGranted) },
        { label: 'Percent complete', value: p.quarterly ? `${p.quarterly.percentComplete}%` : '—' },
      ],
    });
  }

  // Cliff: how many deadlines land in each of the next 26 weeks.
  const start = weekStart(ds.asOf);
  const cliff: CliffPoint[] = [];
  let cumCount = 0;
  let cumDollars = 0;
  for (let w = 0; w < 26; w += 1) {
    const ws = addDays(start, w * 7);
    const we = addDays(ws, 7);
    const inWeek = crossings.filter((c) => c.date >= ws && c.date < we);
    const cCount = inWeek.length;
    const cDollars = inWeek.reduce((s, c) => s + c.dollars, 0);
    cumCount += cCount;
    cumDollars += cDollars;
    cliff.push({ weekStart: ws, crossingCount: cCount, crossingDollars: cDollars, cumulativeCount: cumCount, cumulativeDollars: cumDollars });
  }

  const horizon = bucketHorizon(
    crossings.map((c) => ({ daysUntil: daysBetween(ds.asOf, c.date), dollars: c.dollars })),
  );

  return { rows, cliff, horizon };
}

/* --------------------------------------------------------------- definitions */

export const RFR_DEF: IndicatorDefinition = {
  id: 'rfr-aging',
  number: 2,
  title: 'Requests for Reimbursement aging in process steps',
  shortTitle: 'RFR aging',
  archetype: 'aging',
  question: 'Which reimbursements are past their step target — and is a step broken or is one record stuck?',
  dollarLabel: 'Reimbursement $ held up',
  logic: [
    'For every in-flight RFR, measure days since it entered its current step.',
    'Compare against the per-step day target and bucket into within target / 1–1.5× / 1.5–2× / over 2×.',
    'Step medians and 90th percentiles separate a systemic step problem from a single stuck record.',
  ],
  assumptions: [
    'Seven process steps are modelled with assumed day targets — replace both with your actual workflow and SLAs.',
    'The clock runs on time-in-current-step, not total cycle time. Both are shown; the target applies to the former.',
  ],
};

export const VALIDATION_DEF: IndicatorDefinition = {
  id: 'large-project-validation',
  number: 3,
  title: 'Large project validation',
  shortTitle: 'Large project validation',
  archetype: 'aging',
  question: 'Which large projects breach the validation targets, on timing, on dollars, or on both?',
  dollarLabel: 'Unvalidated $',
  logic: [
    `Flag on timing when days since obligation exceed ${VALIDATION.targetDaysPostObligation}.`,
    `Flag on dollars when more than ${Math.round(VALIDATION.maxUnvalidatedShare * 100)}% of obligated funds remain unvalidated.`,
    'Plot both at once so the two-part rule is visible instead of hidden in a formula; breaching both is the priority set.',
  ],
  assumptions: [
    'The large-project threshold follows the declaration fiscal year ($1.0M / $1.047M in this data).',
    'Withdrawn projects are excluded. Confirm whether closed-but-unvalidated projects should appear.',
  ],
};

export const CLOSEOUT_EXTENSION_DEF: IndicatorDefinition = {
  id: 'closeout-extensions',
  number: 11,
  title: 'Closeout time extensions needed',
  shortTitle: 'Closeout extensions',
  archetype: 'aging',
  question: 'Which open projects run past PoP + 180 days without a closeout extension on the books?',
  dollarLabel: 'Obligated $ on exposed projects',
  logic: [
    `Closeout deadline = period-of-performance end + ${CLOSEOUT.daysAfterPop} days.`,
    'Include projects that remain open and have no manually-tracked closeout extension.',
    `Surface anything inside ${CLOSEOUT.warnLeadDays} days of that deadline, and everything already past it.`,
  ],
  assumptions: [
    'The manual closeout-extension tracker is a simple yes/no per project. If it carries dates, the rule should use them.',
    'Each project has two exits — extend it or close it. The queue shows closeout readiness alongside the deadline so the lever is obvious.',
  ],
};
