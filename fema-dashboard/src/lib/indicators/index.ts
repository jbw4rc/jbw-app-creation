/**
 * The indicator registry: eleven queues, one shape.
 *
 * Everything the UI renders comes from `computeAll`. Filtering works by
 * narrowing the dataset and recomputing — the whole model is small enough that
 * this is instant, and it guarantees charts and tiles can never disagree.
 */

import type { Dataset, ExceptionRow, IndicatorDefinition, IndicatorId, Severity } from '../../types';
import {
  RFI_DEF,
  TIME_EXTENSION_DEF,
  WITHDRAWN_DEF,
  computeRfiMisalignment,
  computeTimeExtensions,
  computeWithdrawnMisalignment,
  type ExtensionResult,
  type RfiResult,
  type WithdrawnResult,
} from './reconciliation';
import {
  CLOSEOUT_EXTENSION_DEF,
  RFR_DEF,
  VALIDATION_DEF,
  computeCloseoutExtensions,
  computeRfrAging,
  computeValidation,
  type CloseoutExtensionResult,
  type RfrResult,
  type ValidationResult,
} from './aging';
import {
  ACCOUNT_DEF,
  CAT_Z_DEF,
  SMALL_PROJECT_DEF,
  computeAccountCloseout,
  computeCatZCloseout,
  computeSmallProjectCloseout,
  type AccountResult,
  type ReadinessResult,
} from './readiness';
import {
  CLOSEOUT_PRIORITY_DEF,
  VALIDATION_PRIORITY_DEF,
  computeCloseoutPriority,
  computeValidationPriority,
  type PriorityResult,
} from './prioritization';
import { buildFlowHistory, computeDeadlineHorizon, computeFunnel, type DeadlineItem, type FlowWeek, type FunnelStage } from './portfolio';

export * from './reconciliation';
export * from './aging';
export * from './readiness';
export * from './prioritization';
export * from './portfolio';

export interface IndicatorSummary {
  def: IndicatorDefinition;
  rows: ExceptionRow[];
  /** The number the tile leads with. For readiness queues this is "ready", not "broken". */
  headlineCount: number;
  headlineDollars: number;
  headlineLabel: string;
  /** Secondary line under the headline. */
  subLabel: string;
  flow: FlowWeek[];
  severityCounts: Record<Severity, number>;
}

export interface AllIndicators {
  ds: Dataset;
  order: IndicatorId[];
  byId: Record<IndicatorId, IndicatorSummary>;
  rfi: RfiResult;
  rfr: RfrResult;
  validation: ValidationResult;
  extensions: ExtensionResult;
  withdrawn: WithdrawnResult;
  smallProjects: ReadinessResult;
  catZ: ReadinessResult;
  accounts: AccountResult;
  validationPriority: PriorityResult;
  closeoutPriority: PriorityResult;
  closeoutExtensions: CloseoutExtensionResult;
  funnel: FunnelStage[];
  deadlines: DeadlineItem[];
  totalExceptionCount: number;
  totalDollarsHeld: number;
}

export const INDICATOR_ORDER: IndicatorId[] = [
  'rfi-misalignment',
  'rfr-aging',
  'large-project-validation',
  'time-extensions',
  'withdrawn-misalignment',
  'small-project-closeout',
  'cat-z-closeout',
  'account-closeout',
  'validation-priority',
  'closeout-priority',
  'closeout-extensions',
];

function severityCounts(rows: ExceptionRow[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, serious: 0, warning: 0, clear: 0 };
  for (const r of rows) out[r.severity] += 1;
  return out;
}

function summary(
  def: IndicatorDefinition,
  rows: ExceptionRow[],
  headlineCount: number,
  headlineDollars: number,
  headlineLabel: string,
  subLabel: string,
  asOf: string,
): IndicatorSummary {
  return {
    def,
    rows,
    headlineCount,
    headlineDollars,
    headlineLabel,
    subLabel,
    flow: buildFlowHistory(def.id, headlineCount, 16, asOf),
    severityCounts: severityCounts(rows),
  };
}

const sum = (rows: ExceptionRow[]) => rows.reduce((s, r) => s + r.dollars, 0);

export function computeAll(ds: Dataset): AllIndicators {
  const rfi = computeRfiMisalignment(ds);
  const rfr = computeRfrAging(ds);
  const validation = computeValidation(ds);
  const extensions = computeTimeExtensions(ds);
  const withdrawn = computeWithdrawnMisalignment(ds);
  const smallProjects = computeSmallProjectCloseout(ds);
  const catZ = computeCatZCloseout(ds);
  const accounts = computeAccountCloseout(ds);
  const validationPriority = computeValidationPriority(ds);
  const closeoutPriority = computeCloseoutPriority(ds);
  const closeoutExtensions = computeCloseoutExtensions(ds);

  const closeoutReadyIds = new Set<string>(
    [...smallProjects.items, ...catZ.items].filter((i) => i.ready && i.projectId).map((i) => i.projectId!),
  );
  const funnel = computeFunnel(ds, closeoutReadyIds);
  const deadlines = computeDeadlineHorizon(ds);

  const byId = {
    'rfi-misalignment': summary(
      RFI_DEF,
      rfi.rows,
      rfi.rows.length,
      sum(rfi.rows),
      'RFIs out of sync',
      `${rfi.alignedCount} of ${rfi.totalCount} aligned`,
      ds.asOf,
    ),
    'rfr-aging': summary(
      RFR_DEF,
      rfr.rows,
      rfr.rows.length,
      sum(rfr.rows),
      'RFRs past step target',
      `${rfr.inFlightCount} in flight`,
      ds.asOf,
    ),
    'large-project-validation': summary(
      VALIDATION_DEF,
      validation.rows,
      validation.rows.length,
      sum(validation.rows),
      'Large projects flagged',
      `${Math.round((validation.portfolioValidated / Math.max(validation.portfolioObligated, 1)) * 100)}% of large-project funds validated`,
      ds.asOf,
    ),
    'time-extensions': summary(
      TIME_EXTENSION_DEF,
      extensions.rows,
      extensions.rows.length,
      sum(extensions.rows),
      'Extensions needed',
      `${extensions.rows.filter((r) => r.severity === 'critical').length} already past PoP end`,
      ds.asOf,
    ),
    'withdrawn-misalignment': summary(
      WITHDRAWN_DEF,
      withdrawn.rows,
      withdrawn.rows.length,
      sum(withdrawn.rows),
      'Withdrawals not propagated',
      'Client system overstates obligations by this amount',
      ds.asOf,
    ),
    'small-project-closeout': summary(
      SMALL_PROJECT_DEF,
      smallProjects.rows,
      smallProjects.readyCount,
      smallProjects.readyDollars,
      'Small projects ready to close',
      `${smallProjects.oneAwayCount} more are one criterion away`,
      ds.asOf,
    ),
    'cat-z-closeout': summary(
      CAT_Z_DEF,
      catZ.rows,
      catZ.readyCount,
      catZ.readyDollars,
      'Cat Z projects ready to close',
      `${catZ.oneAwayCount} more are one criterion away`,
      ds.asOf,
    ),
    'account-closeout': summary(
      ACCOUNT_DEF,
      accounts.rows,
      accounts.readyCount,
      accounts.readyDollars,
      'Accounts ready to close',
      `${accounts.oneAwayCount} more are one criterion away`,
      ds.asOf,
    ),
    'validation-priority': summary(
      VALIDATION_PRIORITY_DEF,
      validationPriority.rows,
      validationPriority.candidates.length,
      validationPriority.capacityUnlock,
      'Validations queued',
      `Top ${validationPriority.capacity} unlock this much of ${Math.round((validationPriority.capacityUnlock / Math.max(validationPriority.totalUnlock, 1)) * 100)}% of the total`,
      ds.asOf,
    ),
    'closeout-priority': summary(
      CLOSEOUT_PRIORITY_DEF,
      closeoutPriority.rows,
      closeoutPriority.candidates.length,
      closeoutPriority.capacityUnlock,
      'Closeouts queued',
      `Top ${closeoutPriority.capacity} unlock ${Math.round((closeoutPriority.capacityUnlock / Math.max(closeoutPriority.totalUnlock, 1)) * 100)}% of the total`,
      ds.asOf,
    ),
    'closeout-extensions': summary(
      CLOSEOUT_EXTENSION_DEF,
      closeoutExtensions.rows,
      closeoutExtensions.rows.length,
      sum(closeoutExtensions.rows),
      'Closeout deadlines exposed',
      `${closeoutExtensions.rows.filter((r) => r.severity === 'critical').length} already past PoP + 180`,
      ds.asOf,
    ),
  } as Record<IndicatorId, IndicatorSummary>;

  // Money held up = the queues where a dollar is genuinely blocked. Priority
  // queues are deliberately excluded so the same dollar isn't counted twice.
  const heldUpQueues: IndicatorId[] = [
    'rfr-aging',
    'large-project-validation',
    'time-extensions',
    'withdrawn-misalignment',
    'small-project-closeout',
    'cat-z-closeout',
  ];

  return {
    ds,
    order: INDICATOR_ORDER,
    byId,
    rfi,
    rfr,
    validation,
    extensions,
    withdrawn,
    smallProjects,
    catZ,
    accounts,
    validationPriority,
    closeoutPriority,
    closeoutExtensions,
    funnel,
    deadlines,
    totalExceptionCount: INDICATOR_ORDER.reduce((s, id) => s + byId[id].headlineCount, 0),
    totalDollarsHeld: heldUpQueues.reduce((s, id) => s + byId[id].headlineDollars, 0),
  };
}

/* ------------------------------------------------------------- filtering */

export interface FilterState {
  disasterId: string | 'all';
  applicantQuery: string;
  newOnly: boolean;
}

export function filterDataset(ds: Dataset, filter: FilterState): Dataset {
  const q = filter.applicantQuery.trim().toLowerCase();
  const applicantMatches = (id: string) => {
    if (!q) return true;
    const a = ds.applicants.find((x) => x.id === id);
    return a ? a.name.toLowerCase().includes(q) : false;
  };
  const disasterMatches = (id: string) => filter.disasterId === 'all' || id === filter.disasterId;

  if (filter.disasterId === 'all' && !q) return ds;

  const accounts = ds.accounts.filter((a) => disasterMatches(a.disasterId) && applicantMatches(a.applicantId));
  const accountIds = new Set(accounts.map((a) => a.id));
  const projects = ds.projects.filter((p) => accountIds.has(p.accountId));
  const projectIds = new Set(projects.map((p) => p.id));

  return {
    ...ds,
    accounts,
    projects,
    rfis: ds.rfis.filter((r) => projectIds.has(r.projectId)),
    rfrs: ds.rfrs.filter((r) => accountIds.has(r.accountId)),
  };
}
