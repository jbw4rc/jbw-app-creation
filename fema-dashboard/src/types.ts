/**
 * Domain model for FEMA Public Assistance grants management.
 *
 * These shapes stand in for the flat tables your Excel/PowerQuery model already
 * produces. When the real extracts arrive, the only thing that should need to
 * change is `data/generate.ts` (replaced by a parser) — every indicator in
 * `lib/indicators/` reads these types and nothing else.
 */

export type DisasterId = string; // 'DR-4744'
export type ApplicantId = string; // 'APP-018'
export type AccountId = string; // 'DR-4744:APP-018'
export type ProjectId = string; // 'PW-01234'

/** FEMA PA work categories. A/B are emergency work; C–G permanent; Z management costs. */
export type Category = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'Z';

export type ProjectSize = 'Small' | 'Large';

/** Lifecycle status as reported by either system of record. */
export type ProjectStatus = 'Open' | 'Withdrawn' | 'Closed';

export interface Disaster {
  id: DisasterId;
  name: string;
  declaredOn: string; // ISO date
  /** Large-project threshold in effect for this disaster's declaration FY. */
  largeProjectThreshold: number;
}

export interface Applicant {
  id: ApplicantId;
  name: string;
  type: 'County' | 'Municipality' | 'School District' | 'Special District' | 'Nonprofit' | 'State Agency' | 'Tribal Nation';
}

/** One applicant for one disaster — the unit that gets closed out (indicator 8). */
export interface Account {
  id: AccountId;
  disasterId: DisasterId;
  applicantId: ApplicantId;
}

export interface Project {
  id: ProjectId;
  accountId: AccountId;
  disasterId: DisasterId;
  applicantId: ApplicantId;
  category: Category;
  size: ProjectSize;
  title: string;

  obligatedAmount: number;
  obligatedOn: string | null;

  /** Period of performance end date per the client system of record. */
  popEndDate: string;
  /** Time extensions already granted and reflected in the system of record. */
  extensionsGranted: number;
  /** A closeout-specific extension the team tracks manually (indicator 11). */
  closeoutExtensionOnFile: boolean;

  /** Status in FEMA Grants Portal. */
  femaStatus: ProjectStatus;
  /** Status in the client (State/Recipient) system of record. */
  sorStatus: ProjectStatus;
  /** When FEMA moved the project to Withdrawn, if it did. */
  femaWithdrawnOn: string | null;

  /** Large projects only: actual costs validated to date. */
  validatedAmount: number;
  validationCompletedOn: string | null;

  /** Funds actually reimbursed to the applicant so far. */
  drawnAmount: number;

  /** Latest quarterly report figures (indicator 4). */
  quarterly: {
    reportedOn: string;
    percentComplete: number;
    projectedCompletionDate: string;
  } | null;

  /** Closeout prerequisites tracked by the team. */
  finalInspectionOn: string | null;
  finalRfrPaidOn: string | null;
  insuranceReconciled: boolean;
  procurementReviewCleared: boolean;
  closedOn: string | null;
}

/** Request for Information. Tracked internally AND present in the client SoR. */
export interface Rfi {
  id: string;
  projectId: ProjectId;
  accountId: AccountId;
  subject: string;
  issuedOn: string;
  dueOn: string;
  /** Status per the team's internal tracker (the Excel workbook). */
  internalStatus: 'Open' | 'Responded' | 'Closed' | null;
  /** Status per the client system of record. `null` = the record isn't there at all. */
  sorStatus: 'Open' | 'Responded' | 'Closed' | null;
  /** When the two sides first disagreed. */
  divergedOn: string | null;
}

export type RfrStep =
  | 'Submitted'
  | 'Recipient Review'
  | 'Documentation Review'
  | 'Fiscal Review'
  | 'FEMA Review'
  | 'Payment Processing'
  | 'Paid';

/** Request for Reimbursement. */
export interface Rfr {
  id: string;
  accountId: AccountId;
  disasterId: DisasterId;
  applicantId: ApplicantId;
  projectIds: ProjectId[];
  amount: number;
  submittedOn: string;
  step: RfrStep;
  /** When the RFR entered its current step — the clock for indicator 2. */
  stepEnteredOn: string;
}

export interface Dataset {
  /** The date the dashboard treats as "today". */
  asOf: string;
  /** Extract timestamps per source — reconciliation is meaningless without them. */
  sources: {
    femaGrantsPortal: string;
    clientSystemOfRecord: string;
    internalTracker: string;
  };
  disasters: Disaster[];
  applicants: Applicant[];
  accounts: Account[];
  projects: Project[];
  rfis: Rfi[];
  rfrs: Rfr[];
}

/* ---------------------------------------------------------------- indicators */

export type IndicatorId =
  | 'rfi-misalignment'
  | 'rfr-aging'
  | 'large-project-validation'
  | 'time-extensions'
  | 'withdrawn-misalignment'
  | 'small-project-closeout'
  | 'cat-z-closeout'
  | 'account-closeout'
  | 'validation-priority'
  | 'closeout-priority'
  | 'closeout-extensions';

export type Archetype = 'reconciliation' | 'aging' | 'readiness' | 'prioritization';

/** Severity is consequence-ranked: compliance breach > money at risk > aging. */
export type Severity = 'critical' | 'serious' | 'warning' | 'clear';

/** One row of work. Every indicator reduces to a list of these. */
export interface ExceptionRow {
  id: string;
  indicator: IndicatorId;
  /** Primary label, e.g. 'PW-01234'. */
  entity: string;
  entityDetail: string;
  projectId: ProjectId | null;
  accountId: AccountId;
  applicantName: string;
  disasterId: DisasterId;
  severity: Severity;
  /** Days the exception has existed (null where age isn't meaningful). */
  ageDays: number | null;
  /** Dollars at stake, unlocked, or overstated — indicator defines which. */
  dollars: number;
  /** What the $ figure means on this queue, for the column header. */
  nextAction: string;
  /** When this exception first became true — drives trend + "new this week". */
  detectedOn: string;
  /** Free-form fields shown in the record drawer. */
  detail: Array<{ label: string; value: string }>;
}

export interface IndicatorDefinition {
  id: IndicatorId;
  /** 1–11, matching how the team refers to them today. */
  number: number;
  title: string;
  shortTitle: string;
  archetype: Archetype;
  /** The management question this queue answers. */
  question: string;
  /** What the dollars column means here. */
  dollarLabel: string;
  /** The business logic, stated plainly — assumptions are visible, not buried. */
  logic: string[];
  /** Assumptions I made that need your confirmation. */
  assumptions: string[];
}
