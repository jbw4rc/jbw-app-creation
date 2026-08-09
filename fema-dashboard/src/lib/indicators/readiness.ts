/**
 * Archetype C — readiness gating (indicators 6, 7, 8).
 *
 * The shared idea: closeout readiness is a checklist, and the useful management
 * views are not "who is ready" (that is just a list) but "which single criterion
 * blocks the most dollars" and "who is one criterion away."
 */

import type { Account, Dataset, ExceptionRow, IndicatorDefinition, Project, Severity } from '../../types';
import { daysBetween } from '../dates';

export interface Criterion {
  key: string;
  /** Column header in the readiness matrix — keep it short. */
  short: string;
  label: string;
}

export interface ReadinessItem {
  id: string;
  entity: string;
  entityDetail: string;
  projectId: string | null;
  accountId: string;
  applicantName: string;
  disasterId: string;
  dollars: number;
  /** true = met, false = blocking, null = not applicable. */
  met: Record<string, boolean | null>;
  unmet: string[];
  ready: boolean;
  /** Extra context shown in the drawer. */
  detail: Array<{ label: string; value: string }>;
}

export interface ReadinessResult {
  criteria: Criterion[];
  items: ReadinessItem[];
  rows: ExceptionRow[];
  readyCount: number;
  readyDollars: number;
  oneAwayCount: number;
  oneAwayDollars: number;
  /** Pareto of what is blocking the portfolio, by dollars. */
  blockers: Array<{ key: string; short: string; label: string; count: number; dollars: number }>;
}

/** Severity here reads as distance-to-done: ready is the opportunity, not a problem. */
function readinessSeverity(unmet: number): Severity {
  if (unmet === 0) return 'clear';
  if (unmet === 1) return 'warning';
  if (unmet === 2) return 'serious';
  return 'critical';
}

function summarize(
  criteria: Criterion[],
  items: ReadinessItem[],
  indicator: ExceptionRow['indicator'],
  asOf: string,
  actionForReady: string,
): ReadinessResult {
  const rows: ExceptionRow[] = items.map((it) => ({
    id: it.id,
    indicator,
    entity: it.entity,
    entityDetail: it.entityDetail,
    projectId: it.projectId,
    accountId: it.accountId,
    applicantName: it.applicantName,
    disasterId: it.disasterId,
    severity: readinessSeverity(it.unmet.length),
    ageDays: null,
    dollars: it.dollars,
    nextAction: it.ready
      ? actionForReady
      : `Blocked by ${it.unmet.length} item${it.unmet.length === 1 ? '' : 's'}: ${it.unmet
          .map((k) => criteria.find((c) => c.key === k)?.short ?? k)
          .join(', ')}`,
    detectedOn: asOf,
    detail: it.detail,
  }));

  const ready = items.filter((i) => i.ready);
  const oneAway = items.filter((i) => i.unmet.length === 1);

  const blockers = criteria
    .map((c) => {
      const hits = items.filter((i) => i.met[c.key] === false);
      return { key: c.key, short: c.short, label: c.label, count: hits.length, dollars: hits.reduce((s, i) => s + i.dollars, 0) };
    })
    .sort((a, b) => b.dollars - a.dollars);

  return {
    criteria,
    items,
    rows,
    readyCount: ready.length,
    readyDollars: ready.reduce((s, i) => s + i.dollars, 0),
    oneAwayCount: oneAway.length,
    oneAwayDollars: oneAway.reduce((s, i) => s + i.dollars, 0),
    blockers,
  };
}

function buildItem(
  id: string,
  entity: string,
  entityDetail: string,
  projectId: string | null,
  accountId: string,
  applicantName: string,
  disasterId: string,
  dollars: number,
  met: Record<string, boolean | null>,
  detail: Array<{ label: string; value: string }>,
): ReadinessItem {
  const unmet = Object.entries(met)
    .filter(([, v]) => v === false)
    .map(([k]) => k);
  return { id, entity, entityDetail, projectId, accountId, applicantName, disasterId, dollars, met, unmet, ready: unmet.length === 0, detail };
}

/* ------------------------------------------ 6. Small projects ready to close */

export const SMALL_PROJECT_CRITERIA: Criterion[] = [
  { key: 'workComplete', short: 'Work done', label: 'Quarterly report shows 100% complete' },
  { key: 'noOpenRfi', short: 'No open RFI', label: 'No open or unanswered RFIs on the project' },
  { key: 'finalInspection', short: 'Inspection', label: 'Final inspection on file' },
  { key: 'finalRfrPaid', short: 'Final RFR paid', label: 'Final Request for Reimbursement paid' },
  { key: 'insurance', short: 'Insurance', label: 'Insurance proceeds reconciled' },
  { key: 'procurement', short: 'Procurement', label: 'Procurement review cleared' },
];

function openRfiCountByProject(ds: Dataset): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of ds.rfis) {
    const openInternal = r.internalStatus === 'Open' || r.internalStatus === 'Responded';
    const openSor = r.sorStatus === 'Open' || r.sorStatus === 'Responded';
    if (openInternal || openSor) m.set(r.projectId, (m.get(r.projectId) ?? 0) + 1);
  }
  return m;
}

function unpaidRfrByProject(ds: Dataset): Set<string> {
  const s = new Set<string>();
  for (const r of ds.rfrs) {
    if (r.step === 'Paid') continue;
    for (const pid of r.projectIds) s.add(pid);
  }
  return s;
}

export function computeSmallProjectCloseout(ds: Dataset): ReadinessResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const openRfis = openRfiCountByProject(ds);
  const items: ReadinessItem[] = [];

  for (const p of ds.projects) {
    if (p.size !== 'Small' || p.category === 'Z') continue;
    if (p.femaStatus !== 'Open' || p.sorStatus === 'Closed') continue;

    const applicant = applicantsById.get(p.applicantId)!;
    const met: Record<string, boolean | null> = {
      workComplete: (p.quarterly?.percentComplete ?? 0) >= 100,
      noOpenRfi: (openRfis.get(p.id) ?? 0) === 0,
      finalInspection: p.finalInspectionOn !== null,
      finalRfrPaid: p.finalRfrPaidOn !== null,
      insurance: p.insuranceReconciled,
      procurement: p.procurementReviewCleared,
    };

    items.push(
      buildItem(
        `SPC-${p.id}`,
        p.id,
        `Cat ${p.category} · ${p.title}`,
        p.id,
        p.accountId,
        applicant.name,
        p.disasterId,
        Math.max(0, p.obligatedAmount - p.drawnAmount),
        met,
        [
          { label: 'Obligated', value: `$${p.obligatedAmount.toLocaleString()}` },
          { label: 'Drawn to date', value: `$${p.drawnAmount.toLocaleString()}` },
          { label: 'Undrawn balance', value: `$${Math.max(0, p.obligatedAmount - p.drawnAmount).toLocaleString()}` },
          { label: 'Percent complete', value: p.quarterly ? `${p.quarterly.percentComplete}%` : '—' },
          { label: 'Open RFIs', value: String(openRfis.get(p.id) ?? 0) },
          { label: 'PoP end', value: p.popEndDate },
        ],
      ),
    );
  }

  return summarize(SMALL_PROJECT_CRITERIA, items, 'small-project-closeout', ds.asOf, 'Ready — submit for closeout');
}

/* ------------------------------------ 7. Large Category Z ready to close */

export const CAT_Z_CRITERIA: Criterion[] = [
  { key: 'siblingsDone', short: 'Other PWs done', label: 'All other projects on the account are closed or withdrawn' },
  { key: 'validated', short: 'Validated', label: 'Management costs fully validated' },
  { key: 'noOpenRfi', short: 'No open RFI', label: 'No open RFIs on the Cat Z project' },
  { key: 'finalRfrPaid', short: 'Final RFR paid', label: 'Final Request for Reimbursement paid' },
  { key: 'procurement', short: 'Procurement', label: 'Procurement review cleared' },
];

export function computeCatZCloseout(ds: Dataset): ReadinessResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const openRfis = openRfiCountByProject(ds);
  const unpaid = unpaidRfrByProject(ds);

  const byAccount = new Map<string, Project[]>();
  for (const p of ds.projects) {
    const arr = byAccount.get(p.accountId) ?? [];
    arr.push(p);
    byAccount.set(p.accountId, arr);
  }

  const items: ReadinessItem[] = [];
  for (const p of ds.projects) {
    if (p.category !== 'Z' || p.size !== 'Large') continue;
    if (p.femaStatus !== 'Open' || p.sorStatus === 'Closed') continue;

    const siblings = (byAccount.get(p.accountId) ?? []).filter((x) => x.id !== p.id);
    const siblingsOpen = siblings.filter((x) => x.femaStatus === 'Open' && x.sorStatus !== 'Closed');
    const applicant = applicantsById.get(p.applicantId)!;

    const met: Record<string, boolean | null> = {
      siblingsDone: siblingsOpen.length === 0,
      validated: p.validatedAmount >= p.obligatedAmount,
      noOpenRfi: (openRfis.get(p.id) ?? 0) === 0,
      finalRfrPaid: !unpaid.has(p.id),
      procurement: p.procurementReviewCleared,
    };

    items.push(
      buildItem(
        `CZC-${p.id}`,
        p.id,
        `Cat Z · management costs`,
        p.id,
        p.accountId,
        applicant.name,
        p.disasterId,
        Math.max(0, p.obligatedAmount - p.drawnAmount),
        met,
        [
          { label: 'Obligated', value: `$${p.obligatedAmount.toLocaleString()}` },
          { label: 'Validated', value: `$${p.validatedAmount.toLocaleString()}` },
          { label: 'Undrawn balance', value: `$${Math.max(0, p.obligatedAmount - p.drawnAmount).toLocaleString()}` },
          { label: 'Sibling projects still open', value: `${siblingsOpen.length} of ${siblings.length}` },
          { label: 'Open RFIs', value: String(openRfis.get(p.id) ?? 0) },
        ],
      ),
    );
  }

  return summarize(CAT_Z_CRITERIA, items, 'cat-z-closeout', ds.asOf, 'Ready — submit management costs for closeout');
}

/* ------------------------------------------- 8. Accounts ready to close out */

export const ACCOUNT_CRITERIA: Criterion[] = [
  { key: 'projectsDone', short: 'All PWs closed', label: 'Every non-Z project is closed or withdrawn' },
  { key: 'catZReady', short: 'Cat Z ready', label: 'Category Z is closed or closeout-ready' },
  { key: 'noOpenRfi', short: 'No open RFI', label: 'No open RFIs anywhere on the account' },
  { key: 'noRfrInFlight', short: 'No RFR in flight', label: 'All Requests for Reimbursement paid' },
  { key: 'largeValidated', short: 'Large PWs validated', label: 'All large projects fully validated' },
];

export interface AccountReadiness extends ReadinessItem {
  totalProjects: number;
  closedProjects: number;
  openProjects: number;
}

export interface AccountResult extends ReadinessResult {
  accounts: AccountReadiness[];
}

export function computeAccountCloseout(ds: Dataset): AccountResult {
  const applicantsById = new Map(ds.applicants.map((a) => [a.id, a]));
  const openRfis = openRfiCountByProject(ds);
  const catZ = computeCatZCloseout(ds);
  const catZReadyByProject = new Map(catZ.items.map((i) => [i.projectId!, i.ready]));

  const byAccount = new Map<string, Project[]>();
  for (const p of ds.projects) {
    const arr = byAccount.get(p.accountId) ?? [];
    arr.push(p);
    byAccount.set(p.accountId, arr);
  }
  const rfrsByAccount = new Map<string, number>();
  for (const r of ds.rfrs) {
    if (r.step === 'Paid') continue;
    rfrsByAccount.set(r.accountId, (rfrsByAccount.get(r.accountId) ?? 0) + 1);
  }

  const accounts: AccountReadiness[] = [];

  for (const account of ds.accounts as Account[]) {
    const ps = byAccount.get(account.id) ?? [];
    if (ps.length === 0) continue;
    const openPs = ps.filter((p) => p.femaStatus === 'Open' && p.sorStatus !== 'Closed');
    if (openPs.length === 0) continue; // already effectively closed

    const nonZ = ps.filter((p) => p.category !== 'Z');
    const nonZOpen = nonZ.filter((p) => p.femaStatus === 'Open' && p.sorStatus !== 'Closed');
    const zProjects = ps.filter((p) => p.category === 'Z');
    const zReady = zProjects.every((z) => z.femaStatus !== 'Open' || (catZReadyByProject.get(z.id) ?? true));
    const accountOpenRfis = ps.reduce((s, p) => s + (openRfis.get(p.id) ?? 0), 0);
    const largeUnvalidated = ps.filter((p) => p.size === 'Large' && p.validatedAmount < p.obligatedAmount && p.femaStatus !== 'Withdrawn');

    const applicant = applicantsById.get(account.applicantId)!;
    const met: Record<string, boolean | null> = {
      projectsDone: nonZOpen.length === 0,
      catZReady: zReady,
      noOpenRfi: accountOpenRfis === 0,
      noRfrInFlight: (rfrsByAccount.get(account.id) ?? 0) === 0,
      largeValidated: largeUnvalidated.length === 0,
    };

    const undrawn = ps.reduce((s, p) => s + Math.max(0, p.obligatedAmount - p.drawnAmount), 0);
    const base = buildItem(
      `ACC-${account.id}`,
      applicant.name,
      `${account.disasterId} · ${ps.length} projects`,
      null,
      account.id,
      applicant.name,
      account.disasterId,
      undrawn,
      met,
      [
        { label: 'Disaster', value: account.disasterId },
        { label: 'Projects', value: `${ps.length} total, ${openPs.length} open` },
        { label: 'Non-Z projects still open', value: String(nonZOpen.length) },
        { label: 'Open RFIs on account', value: String(accountOpenRfis) },
        { label: 'RFRs in flight', value: String(rfrsByAccount.get(account.id) ?? 0) },
        { label: 'Large projects unvalidated', value: String(largeUnvalidated.length) },
        { label: 'Undrawn balance', value: `$${undrawn.toLocaleString()}` },
      ],
    );

    accounts.push({
      ...base,
      totalProjects: ps.length,
      closedProjects: ps.length - openPs.length,
      openProjects: openPs.length,
    });
  }

  const summary = summarize(ACCOUNT_CRITERIA, accounts, 'account-closeout', ds.asOf, 'Ready — initiate account closeout');
  return { ...summary, accounts };
}

/* --------------------------------------------------------------- definitions */

export const SMALL_PROJECT_DEF: IndicatorDefinition = {
  id: 'small-project-closeout',
  number: 6,
  title: 'Small projects ready for closeout',
  shortTitle: 'Small project closeout',
  archetype: 'readiness',
  question: 'Which small projects can be closed today, and what single thing is blocking the rest?',
  dollarLabel: 'Undrawn $ released at closeout',
  logic: [
    'Scope: open small projects (excluding Cat Z), not already closed in the client system.',
    'Six criteria must all be met: work complete, no open RFIs, final inspection, final RFR paid, insurance reconciled, procurement cleared.',
    'Items missing exactly one criterion are called out separately — that is the week\'s work plan.',
  ],
  assumptions: [
    'These six criteria are placeholders. Replace them with your actual small-project closeout logic — the matrix columns are driven directly by this list.',
    'Small projects are treated as closing on estimate, so no validation criterion is applied.',
  ],
};

export const CAT_Z_DEF: IndicatorDefinition = {
  id: 'cat-z-closeout',
  number: 7,
  title: 'Large Category Z projects ready for closeout',
  shortTitle: 'Cat Z closeout',
  archetype: 'readiness',
  question: 'Which management-cost projects can close, and are they waiting on themselves or on their account?',
  dollarLabel: 'Undrawn $ released at closeout',
  logic: [
    'Scope: open large Category Z (management costs) projects.',
    'Management costs generally cannot close before the rest of the account, so sibling completion is the first criterion.',
    'Remaining criteria: fully validated, no open RFIs, final RFR paid, procurement cleared.',
  ],
  assumptions: [
    'Cat Z is shown as the tail of its account rather than a standalone silo, because "blocked by siblings" is the usual answer.',
    'Confirm whether your process allows Cat Z to close before all sibling projects.',
  ],
};

export const ACCOUNT_DEF: IndicatorDefinition = {
  id: 'account-closeout',
  number: 8,
  title: 'Accounts ready for closeout',
  shortTitle: 'Account closeout',
  archetype: 'readiness',
  question: 'Which applicant-disaster accounts can be closed, and which are one or two projects from the finish line?',
  dollarLabel: 'Undrawn $ across the account',
  logic: [
    'An account is one applicant for one disaster; it is ready when every project beneath it is resolved.',
    'Criteria: all non-Z projects closed or withdrawn, Cat Z closed or ready, no open RFIs, no RFRs in flight, all large projects validated.',
    'Accounts are ranked by how few projects remain, so last-mile accounts surface first.',
  ],
  assumptions: [
    'Account readiness rolls up from project readiness. If your closeout process has account-level requirements of its own, they need adding.',
    'Accounts with no open projects are treated as already closed and excluded.',
  ],
};

/** Shared helper: days a project has been sitting past its PoP end. */
export function daysPastPop(p: Project, asOf: string): number {
  return daysBetween(p.popEndDate, asOf);
}
