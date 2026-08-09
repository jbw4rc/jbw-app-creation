/**
 * Archetype A — reconciliation between two systems (indicators 1, 4, 5).
 *
 * The shared idea: an exception is a DISAGREEMENT, and the *direction* of the
 * disagreement determines who fixes it. A single "27 mismatches" number hides
 * that, so each of these produces a typed, directional queue.
 */

import type { Dataset, ExceptionRow, IndicatorDefinition, Project, Severity } from '../../types';
import { addDays, daysBetween } from '../dates';
import { CLOSEOUT, horizonBucket } from '../../config/thresholds';

/* --------------------------------------------- 1. RFI tracker vs. client SoR */

export const RFI_INTERNAL_STATES = ['Open', 'Responded', 'Closed', 'Not tracked'] as const;
export const RFI_SOR_STATES = ['Open', 'Responded', 'Closed', 'No record'] as const;

export type RfiCell = {
  internal: (typeof RFI_INTERNAL_STATES)[number];
  sor: (typeof RFI_SOR_STATES)[number];
  aligned: boolean;
  count: number;
  dollars: number;
};

export interface RfiResult {
  rows: ExceptionRow[];
  matrix: RfiCell[];
  alignedCount: number;
  totalCount: number;
}

/** Severity by what the disagreement costs us, not by how old it is. */
function rfiSeverity(internal: string, sor: string): { severity: Severity; action: string } {
  if (internal === 'Not tracked' && (sor === 'Open' || sor === 'Responded')) {
    return {
      severity: 'critical',
      action: 'Add to internal tracker and assign — an RFI is live in the client system that nobody is working',
    };
  }
  if (internal === 'Closed' && sor === 'Open') {
    return { severity: 'serious', action: 'Push closure evidence to the client system — it still shows this open' };
  }
  if (sor === 'No record') {
    return { severity: 'serious', action: 'Confirm the RFI exists; if it does, get it entered in the client system' };
  }
  if (internal === 'Open' && sor === 'Closed') {
    return { severity: 'warning', action: 'Verify closure, then retire the item from the internal tracker' };
  }
  return { severity: 'warning', action: 'Reconcile the response status between the two systems' };
}

export function computeRfiMisalignment(ds: Dataset): RfiResult {
  const projectsById = new Map(ds.projects.map((p) => [p.id, p]));
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));

  const cells = new Map<string, RfiCell>();
  for (const i of RFI_INTERNAL_STATES) {
    for (const s of RFI_SOR_STATES) {
      cells.set(`${i}|${s}`, { internal: i, sor: s, aligned: i === s, count: 0, dollars: 0 });
    }
  }

  const rows: ExceptionRow[] = [];
  let aligned = 0;

  for (const rfi of ds.rfis) {
    const project = projectsById.get(rfi.projectId);
    if (!project) continue;
    const internal = (rfi.internalStatus ?? 'Not tracked') as (typeof RFI_INTERNAL_STATES)[number];
    const sor = (rfi.sorStatus ?? 'No record') as (typeof RFI_SOR_STATES)[number];

    const cell = cells.get(`${internal}|${sor}`)!;
    cell.count += 1;
    cell.dollars += project.obligatedAmount;

    if (internal === sor) {
      aligned += 1;
      continue;
    }

    const { severity, action } = rfiSeverity(internal, sor);
    const detectedOn = rfi.divergedOn ?? rfi.issuedOn;
    const applicant = applicantsById.get(project.applicantId)!;

    rows.push({
      id: rfi.id,
      indicator: 'rfi-misalignment',
      entity: rfi.id,
      entityDetail: `${project.id} · ${rfi.subject}`,
      projectId: project.id,
      accountId: project.accountId,
      applicantName: applicant.name,
      disasterId: project.disasterId,
      severity,
      ageDays: daysBetween(detectedOn, ds.asOf),
      dollars: project.obligatedAmount,
      nextAction: action,
      detectedOn,
      detail: [
        { label: 'Internal tracker', value: internal },
        { label: 'Client system of record', value: sor },
        { label: 'RFI issued', value: rfi.issuedOn },
        { label: 'Response due', value: rfi.dueOn },
        { label: 'Project', value: `${project.id} — ${project.title}` },
      ],
    });
  }

  return { rows, matrix: [...cells.values()], alignedCount: aligned, totalCount: ds.rfis.length };
}

/* ------------------------------------- 4. Time extensions from quarterly data */

export interface ExtensionNeed {
  project: Project;
  popEndDate: string;
  projectedCompletionDate: string;
  gapDays: number;
  daysUntilPop: number;
}

export interface ExtensionResult {
  rows: ExceptionRow[];
  needs: ExtensionNeed[];
  horizon: Array<{ key: string; count: number; dollars: number }>;
}

export function computeTimeExtensions(ds: Dataset): ExtensionResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const rows: ExceptionRow[] = [];
  const needs: ExtensionNeed[] = [];

  for (const p of ds.projects) {
    if (p.femaStatus !== 'Open' || p.sorStatus === 'Closed') continue;
    if (!p.quarterly || p.quarterly.percentComplete >= 100) continue;

    const gapDays = daysBetween(p.popEndDate, p.quarterly.projectedCompletionDate);
    if (gapDays <= 0) continue; // work finishes inside the period of performance

    const daysUntilPop = daysBetween(ds.asOf, p.popEndDate);
    const severity: Severity =
      daysUntilPop < 0 ? 'critical' : daysUntilPop <= 30 ? 'serious' : daysUntilPop <= 90 ? 'warning' : 'clear';

    needs.push({ project: p, popEndDate: p.popEndDate, projectedCompletionDate: p.quarterly.projectedCompletionDate, gapDays, daysUntilPop });

    const applicant = applicantsById.get(p.applicantId)!;
    rows.push({
      id: `TE-${p.id}`,
      indicator: 'time-extensions',
      entity: p.id,
      entityDetail: `Cat ${p.category} · ${p.title}`,
      projectId: p.id,
      accountId: p.accountId,
      applicantName: applicant.name,
      disasterId: p.disasterId,
      severity,
      ageDays: daysUntilPop < 0 ? -daysUntilPop : null,
      dollars: p.obligatedAmount,
      nextAction:
        daysUntilPop < 0
          ? 'Period of performance has lapsed — file a retroactive extension request immediately'
          : `Request a ${Math.ceil(gapDays / 30)}-month extension before the period of performance ends`,
      detectedOn: p.quarterly.reportedOn,
      detail: [
        { label: 'PoP end (system of record)', value: p.popEndDate },
        { label: 'Projected completion (quarterly report)', value: p.quarterly.projectedCompletionDate },
        { label: 'Extension needed', value: `${gapDays} days (~${Math.ceil(gapDays / 30)} months)` },
        { label: 'Percent complete', value: `${p.quarterly.percentComplete}%` },
        { label: 'Extensions already granted', value: String(p.extensionsGranted) },
        { label: 'Quarterly report date', value: p.quarterly.reportedOn },
      ],
    });
  }

  const horizon = bucketHorizon(needs.map((n) => ({ daysUntil: n.daysUntilPop, dollars: n.project.obligatedAmount })));
  return { rows, needs, horizon };
}

/* --------------------------------- 5. Withdrawn in FEMA, still open in client */

export interface WithdrawnResult {
  rows: ExceptionRow[];
  agingBuckets: Array<{ label: string; count: number; dollars: number }>;
  overstatedByDisaster: Array<{ disasterId: string; dollars: number; count: number }>;
}

export function computeWithdrawnMisalignment(ds: Dataset): WithdrawnResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const rows: ExceptionRow[] = [];

  for (const p of ds.projects) {
    if (p.femaStatus !== 'Withdrawn') continue;
    if (p.sorStatus === 'Withdrawn') continue;

    const withdrawnOn = p.femaWithdrawnOn ?? ds.asOf;
    const ageDays = daysBetween(withdrawnOn, ds.asOf);
    const severity: Severity = ageDays > 180 ? 'critical' : ageDays > 90 ? 'serious' : ageDays > 30 ? 'warning' : 'clear';
    const applicant = applicantsById.get(p.applicantId)!;

    rows.push({
      id: `WD-${p.id}`,
      indicator: 'withdrawn-misalignment',
      entity: p.id,
      entityDetail: `Cat ${p.category} · ${p.title}`,
      projectId: p.id,
      accountId: p.accountId,
      applicantName: applicant.name,
      disasterId: p.disasterId,
      severity,
      ageDays,
      dollars: p.obligatedAmount,
      nextAction: 'Mark withdrawn in the client system of record and close the project out',
      detectedOn: withdrawnOn,
      detail: [
        { label: 'FEMA status', value: p.femaStatus },
        { label: 'Client system status', value: p.sorStatus },
        { label: 'Withdrawn in FEMA on', value: withdrawnOn },
        { label: 'Days out of sync', value: String(ageDays) },
        { label: 'Amount still shown obligated in client system', value: `$${p.obligatedAmount.toLocaleString()}` },
      ],
    });
  }

  const bands = [
    { label: '0–30 days', lo: 0, hi: 30 },
    { label: '31–90 days', lo: 30, hi: 90 },
    { label: '91–180 days', lo: 90, hi: 180 },
    { label: 'Over 180 days', lo: 180, hi: Infinity },
  ];
  const agingBuckets = bands.map((b) => {
    const hits = rows.filter((r) => (r.ageDays ?? 0) > b.lo && (r.ageDays ?? 0) <= b.hi);
    return { label: b.label, count: hits.length, dollars: hits.reduce((s, r) => s + r.dollars, 0) };
  });

  const byDisaster = new Map<string, { dollars: number; count: number }>();
  for (const r of rows) {
    const cur = byDisaster.get(r.disasterId) ?? { dollars: 0, count: 0 };
    cur.dollars += r.dollars;
    cur.count += 1;
    byDisaster.set(r.disasterId, cur);
  }

  return {
    rows,
    agingBuckets,
    overstatedByDisaster: [...byDisaster.entries()]
      .map(([disasterId, v]) => ({ disasterId, ...v }))
      .sort((a, b) => b.dollars - a.dollars),
  };
}

/* -------------------------------------------------------------------- shared */

export function bucketHorizon(items: Array<{ daysUntil: number; dollars: number }>) {
  const keys = ['past', 'd30', 'd60', 'd90', 'later'];
  const out = keys.map((key) => ({ key, count: 0, dollars: 0 }));
  for (const it of items) {
    const k = horizonBucket(it.daysUntil);
    const slot = out.find((o) => o.key === k)!;
    slot.count += 1;
    slot.dollars += it.dollars;
  }
  return out;
}

/** Closeout deadline = period-of-performance end + the configured grace window. */
export function closeoutDeadline(p: Project): string {
  return addDays(p.popEndDate, CLOSEOUT.daysAfterPop);
}

/* --------------------------------------------------------------- definitions */

export const RFI_DEF: IndicatorDefinition = {
  id: 'rfi-misalignment',
  number: 1,
  title: 'RFI tracking vs. client system of record',
  shortTitle: 'RFI misalignment',
  archetype: 'reconciliation',
  question: 'Where does our internal RFI tracker disagree with the client system, and which way?',
  dollarLabel: 'Obligated $ on affected projects',
  logic: [
    'Join internal RFI tracker to the client system of record on RFI identifier.',
    'Any pair whose status differs — including records missing from either side — is an exception.',
    'Direction determines the action: a live RFI we are not tracking is a deadline risk; a stale internal row is cleanup.',
  ],
  assumptions: [
    'RFIs can be joined on a shared identifier. If the join is fuzzy (project + subject + date), the match rule needs your input.',
    'Four statuses are modelled (Open / Responded / Closed / absent). Tell me the real status vocabulary.',
  ],
};

export const TIME_EXTENSION_DEF: IndicatorDefinition = {
  id: 'time-extensions',
  number: 4,
  title: 'Time extensions needed',
  shortTitle: 'Time extensions',
  archetype: 'reconciliation',
  question: 'Which projects will not finish inside their period of performance, and how much extension do they need?',
  dollarLabel: 'Obligated $ at risk if PoP lapses',
  logic: [
    'Take the latest quarterly report per open project.',
    'Flag where projected completion date is later than the period-of-performance end date in the system of record.',
    'Extension size = projected completion − PoP end. Urgency = days until PoP end.',
  ],
  assumptions: [
    'Projects under 100% complete only. A project reporting 100% complete is treated as needing no extension.',
    'The quarterly report is the authority on projected completion; the system of record is the authority on PoP end.',
  ],
};

export const WITHDRAWN_DEF: IndicatorDefinition = {
  id: 'withdrawn-misalignment',
  number: 5,
  title: 'Withdrawn in FEMA, still open in the client system',
  shortTitle: 'Withdrawn misalignment',
  archetype: 'reconciliation',
  question: 'How much funding is the client system overstating because withdrawals never propagated?',
  dollarLabel: 'Obligated $ overstated in client system',
  logic: [
    'Find projects with FEMA status = Withdrawn.',
    'Flag any whose client-system status is not Withdrawn.',
    'Age the exception from the FEMA withdrawal date — the longer it sits, the longer the books are wrong.',
  ],
  assumptions: [
    'The headline is dollars overstated rather than a record count, because this is a financial-accuracy exposure.',
    'Withdrawal in FEMA is treated as authoritative; the client system is the one that needs updating.',
  ],
};
