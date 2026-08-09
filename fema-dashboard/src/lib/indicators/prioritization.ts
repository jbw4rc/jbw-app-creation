/**
 * Archetype D — prioritization by dollars unlocked (indicators 9, 10).
 *
 * A ranked list is not a decision. What turns it into one is (a) a capacity cut
 * line, so you can see what this month's throughput actually buys, and (b) an
 * effort axis, because six validations at one applicant cost far less than six
 * scattered across six applicants.
 */

import type { Dataset, ExceptionRow, IndicatorDefinition, Severity } from '../../types';
import { CAPACITY } from '../../config/thresholds';
import { computeValidation } from './aging';
import { computeCatZCloseout, computeSmallProjectCloseout } from './readiness';

export interface PriorityCandidate {
  id: string;
  entity: string;
  entityDetail: string;
  projectId: string | null;
  accountId: string;
  applicantName: string;
  disasterId: string;
  /** Dollars released if this item is worked. */
  unlock: number;
  /** Lower is easier. Drives the effort axis of the value/effort view. */
  effortScore: number;
  effortLabel: string;
  /** How many sibling items sit at the same applicant — the batching signal. */
  batchSize: number;
  severity: Severity;
  detail: Array<{ label: string; value: string }>;
}

export interface PriorityResult {
  rows: ExceptionRow[];
  candidates: PriorityCandidate[];
  /** Cumulative unlock following the ranked order. */
  cumulative: number[];
  totalUnlock: number;
  capacity: number;
  /** Dollars unlocked by working the top `capacity` items. */
  capacityUnlock: number;
  /** Applicants grouped by total unlock — the batching view. */
  batches: Array<{ applicantName: string; items: number; unlock: number }>;
}

function assemble(
  candidates: PriorityCandidate[],
  indicator: ExceptionRow['indicator'],
  capacity: number,
  asOf: string,
  action: (c: PriorityCandidate, rank: number) => string,
): PriorityResult {
  const sorted = [...candidates].sort((a, b) => b.unlock - a.unlock);
  const cumulative: number[] = [];
  let running = 0;
  for (const c of sorted) {
    running += c.unlock;
    cumulative.push(running);
  }
  const totalUnlock = running;
  const capacityUnlock = cumulative[Math.min(capacity, cumulative.length) - 1] ?? 0;

  const byApplicant = new Map<string, { items: number; unlock: number }>();
  for (const c of sorted) {
    const cur = byApplicant.get(c.applicantName) ?? { items: 0, unlock: 0 };
    cur.items += 1;
    cur.unlock += c.unlock;
    byApplicant.set(c.applicantName, cur);
  }

  const rows: ExceptionRow[] = sorted.map((c, i) => ({
    id: c.id,
    indicator,
    entity: c.entity,
    entityDetail: c.entityDetail,
    projectId: c.projectId,
    accountId: c.accountId,
    applicantName: c.applicantName,
    disasterId: c.disasterId,
    severity: c.severity,
    ageDays: null,
    dollars: c.unlock,
    nextAction: action(c, i + 1),
    detectedOn: asOf,
    detail: c.detail,
  }));

  return {
    rows,
    candidates: sorted,
    cumulative,
    totalUnlock,
    capacity,
    capacityUnlock,
    batches: [...byApplicant.entries()]
      .map(([applicantName, v]) => ({ applicantName, ...v }))
      .sort((a, b) => b.unlock - a.unlock),
  };
}

/* ------------------------------------------ 9. Validation prioritization */

export function computeValidationPriority(ds: Dataset): PriorityResult {
  const validation = computeValidation(ds);
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));

  const perApplicant = new Map<string, number>();
  for (const pt of validation.points) {
    perApplicant.set(pt.project.applicantId, (perApplicant.get(pt.project.applicantId) ?? 0) + 1);
  }

  const candidates: PriorityCandidate[] = validation.points.map((pt) => {
    const p = pt.project;
    const applicant = applicantsById.get(p.applicantId)!;
    const batchSize = perApplicant.get(p.applicantId) ?? 1;
    // Effort: a validation is cheaper when the applicant has several to do at
    // once, and dearer when almost nothing has been validated yet.
    const effortScore = Math.round((pt.unvalidatedShare * 60) + (batchSize > 1 ? 0 : 25) + (p.category === 'Z' ? -10 : 0));

    return {
      id: `VP-${p.id}`,
      entity: p.id,
      entityDetail: `Cat ${p.category} · ${applicant.name}`,
      projectId: p.id,
      accountId: p.accountId,
      applicantName: applicant.name,
      disasterId: p.disasterId,
      unlock: pt.unvalidatedDollars,
      effortScore,
      effortLabel: batchSize > 1 ? `${batchSize} validations at this applicant` : 'Single validation at this applicant',
      batchSize,
      severity: pt.flagDays && pt.flagShare ? 'critical' : pt.flagDays ? 'serious' : pt.flagShare ? 'warning' : 'clear',
      detail: [
        { label: 'Unvalidated', value: `$${pt.unvalidatedDollars.toLocaleString()}` },
        { label: 'Obligated', value: `$${p.obligatedAmount.toLocaleString()}` },
        { label: 'Unvalidated share', value: `${Math.round(pt.unvalidatedShare * 100)}%` },
        { label: 'Days post-obligation', value: String(pt.daysPostObligation) },
        { label: 'Other validations at this applicant', value: String(batchSize - 1) },
      ],
    };
  });

  return assemble(
    candidates,
    'validation-priority',
    CAPACITY.validationsPerMonth,
    ds.asOf,
    (c, rank) =>
      rank <= CAPACITY.validationsPerMonth
        ? `Rank ${rank} — inside this month's capacity; schedule the site validation`
        : `Rank ${rank} — below the capacity line; batch with other work at ${c.applicantName}`,
  );
}

/* -------------------------------------------- 10. Closeout prioritization */

export function computeCloseoutPriority(ds: Dataset): PriorityResult {
  const small = computeSmallProjectCloseout(ds);
  const catZ = computeCatZCloseout(ds);
  const all = [...small.items, ...catZ.items].filter((i) => i.unmet.length <= 1);

  const perApplicant = new Map<string, number>();
  for (const i of all) perApplicant.set(i.applicantName, (perApplicant.get(i.applicantName) ?? 0) + 1);

  const candidates: PriorityCandidate[] = all.map((i) => {
    const batchSize = perApplicant.get(i.applicantName) ?? 1;
    return {
      id: `CP-${i.id}`,
      entity: i.entity,
      entityDetail: i.entityDetail,
      projectId: i.projectId,
      accountId: i.accountId,
      applicantName: i.applicantName,
      disasterId: i.disasterId,
      unlock: i.dollars,
      effortScore: i.unmet.length * 40 + (batchSize > 1 ? 0 : 20),
      effortLabel: i.ready ? 'Ready now' : `One blocker: ${i.unmet.join(', ')}`,
      batchSize,
      severity: i.ready ? 'clear' : 'warning',
      detail: i.detail,
    };
  });

  return assemble(
    candidates,
    'closeout-priority',
    CAPACITY.closeoutsPerMonth,
    ds.asOf,
    (c, rank) =>
      rank <= CAPACITY.closeoutsPerMonth
        ? `Rank ${rank} — inside this month's capacity; ${c.effortLabel === 'Ready now' ? 'submit closeout' : 'clear the blocker and submit'}`
        : `Rank ${rank} — below the capacity line`,
  );
}

/* --------------------------------------------------------------- definitions */

export const VALIDATION_PRIORITY_DEF: IndicatorDefinition = {
  id: 'validation-priority',
  number: 9,
  title: 'Validation prioritization by funding unlocked',
  shortTitle: 'Validation priority',
  archetype: 'prioritization',
  question: "What should we validate next, and what does this month's capacity actually buy?",
  dollarLabel: 'Unvalidated $ unlocked',
  logic: [
    'Candidates are large projects with unvalidated obligated funds.',
    'Ranked by dollars unlocked; the capacity line marks how far the team can get this month.',
    'Effort accounts for batching — several validations at one applicant cost less per item than scattered ones.',
  ],
  assumptions: [
    `Capacity is assumed at ${CAPACITY.validationsPerMonth} validations per month. Set this to your real throughput — it drives the cut line.`,
    'Effort is a modelled proxy. If you track actual validation effort or travel cost, that should replace it.',
  ],
};

export const CLOSEOUT_PRIORITY_DEF: IndicatorDefinition = {
  id: 'closeout-priority',
  number: 10,
  title: 'Closeout prioritization by funding unlocked',
  shortTitle: 'Closeout priority',
  archetype: 'prioritization',
  question: 'Which closeouts release the most funding for the least work?',
  dollarLabel: 'Undrawn $ released at closeout',
  logic: [
    'Candidates are closeout-ready items plus those one criterion away (small projects and large Cat Z).',
    'Ranked by undrawn balance released on closeout, with the monthly capacity line drawn in.',
    'Ready-now items and one-blocker items are distinguished so the cheap wins are visible.',
  ],
  assumptions: [
    `Capacity is assumed at ${CAPACITY.closeoutsPerMonth} closeouts per month.`,
    'Funding unlocked is modelled as the undrawn balance. If closeout releases something else in your accounting, say so and the metric changes.',
  ],
};
