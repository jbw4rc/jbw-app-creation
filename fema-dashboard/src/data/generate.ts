/**
 * Seeded synthetic dataset — FEMA-shaped, entirely fictional.
 *
 * Applicant names, PW numbers and dollar figures are invented. The generator is
 * deterministic (fixed seed) so the dashboard shows the same numbers on every
 * load and screenshots stay stable.
 *
 * This is the ONLY file that should be replaced when real extracts arrive: swap
 * it for a parser that emits the same `Dataset` shape.
 */

import type {
  Account,
  Applicant,
  Category,
  Dataset,
  Disaster,
  Project,
  ProjectStatus,
  Rfi,
  Rfr,
  RfrStep,
} from '../types';
import { RFR_STEP_ORDER } from '../config/thresholds';
import { addDays, daysBetween, iso } from '../lib/dates';

/* --------------------------------------------------------------------- rng */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260809);

const rand = () => rng();
const randInt = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];
const chance = (p: number) => rng() < p;

/** Weighted pick: `[[value, weight], ...]`. */
function weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** Long-tailed dollar amounts — most projects small, a few very large. */
function lognormal(median: number, sigma: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return median * Math.exp(sigma * z);
}

/* ------------------------------------------------------------------ config */

export const AS_OF = '2026-08-09';

const DISASTERS: Disaster[] = [
  { id: 'DR-4701', name: 'Severe Storms & Flooding', declaredOn: '2023-09-14', largeProjectThreshold: 1_000_000 },
  { id: 'DR-4744', name: 'Tropical Storm Marlowe', declaredOn: '2024-05-31', largeProjectThreshold: 1_000_000 },
  { id: 'DR-4808', name: 'Winter Storms & Landslides', declaredOn: '2025-02-02', largeProjectThreshold: 1_047_000 },
  { id: 'DR-4855', name: 'Hurricane Verity', declaredOn: '2025-10-01', largeProjectThreshold: 1_047_000 },
];

const COUNTY_NAMES = [
  'Cypress',
  'Blackwater',
  'Marrow Creek',
  'Fallow',
  'Redbud',
  'Stonefield',
  'Winslow',
  'Harrow',
  'Pinecrest',
  'Thistle',
  'Vermillion',
  'Ashgrove',
];

const CITY_NAMES = [
  'Ravenwood',
  'Kestrel',
  'Fairlight',
  'Old Mill',
  'Bracken',
  'Northgate',
  'Silverton',
  'Cobblehill',
  'Wren Hollow',
  'Alder Bay',
];

const SPECIAL_DISTRICTS = [
  'Tidewater Drainage District',
  'Lower Basin Water Authority',
  'Coastal Utilities District',
  'Highland Fire District',
  'Riverbend Levee District',
  'Greenfield Transit Authority',
];

const NONPROFITS = [
  'Meridian Regional Medical Center',
  'Harbor Point Community Services',
  'St. Auberon Hospital',
  'Lakeshore Senior Housing Corp.',
];

const STATE_AGENCIES = ['Dept. of Transportation', 'Dept. of Natural Resources', 'State University System'];

const TRIBAL = ['Willow Band of River People', 'Three Pines Nation'];

const CATEGORY_TITLES: Record<Category, string[]> = {
  A: ['Countywide debris removal', 'Waterway debris clearance', 'Vegetative debris — Zone 3', 'Hazardous tree removal'],
  B: ['Emergency protective measures', 'Sheltering operations', 'Emergency sandbag operations', 'Mass care support'],
  C: ['County Road 14 embankment repair', 'Bridge 22 scour repair', 'Culvert replacement — Route 9', 'Shoulder & guardrail restoration'],
  D: ['Levee section 4 restoration', 'Storm drain pump station repair', 'Detention basin repair'],
  E: ['Public works facility roof replacement', 'Elementary school HVAC restoration', 'Courthouse flood damage repair', 'Fleet equipment replacement'],
  F: ['Lift station 7 rebuild', 'Water treatment plant electrical repair', 'Sewer main relining'],
  G: ['Riverside Park restoration', 'Municipal marina dock repair', 'Athletic complex field restoration'],
  Z: ['Management costs'],
};

const RFI_SUBJECTS = [
  'Force account labor documentation',
  'Procurement method justification',
  'Insurance proceeds documentation',
  'Scope clarification — damage description',
  'Cost reasonableness support',
  'Environmental & historic preservation review',
  'Equipment usage rates',
  'Contract pricing backup',
  'Site photographs & measurements',
  'Duplication of benefits certification',
];

/* --------------------------------------------------------------- generation */

function buildApplicants(): Applicant[] {
  const out: Applicant[] = [];
  let n = 1;
  const add = (name: string, type: Applicant['type']) => {
    out.push({ id: `APP-${String(n).padStart(3, '0')}`, name, type });
    n += 1;
  };
  COUNTY_NAMES.forEach((c) => add(`${c} County`, 'County'));
  CITY_NAMES.forEach((c) => add(`City of ${c}`, 'Municipality'));
  COUNTY_NAMES.slice(0, 8).forEach((c) => add(`${c} Unified School District`, 'School District'));
  SPECIAL_DISTRICTS.forEach((s) => add(s, 'Special District'));
  NONPROFITS.forEach((s) => add(s, 'Nonprofit'));
  STATE_AGENCIES.forEach((s) => add(s, 'State Agency'));
  TRIBAL.forEach((s) => add(s, 'Tribal Nation'));
  return out;
}

/** Bigger applicants carry more projects. */
function projectCountFor(type: Applicant['type']): number {
  switch (type) {
    case 'County':
      return randInt(9, 22);
    case 'State Agency':
      return randInt(10, 20);
    case 'Municipality':
      return randInt(5, 13);
    case 'School District':
      return randInt(3, 8);
    case 'Special District':
      return randInt(3, 9);
    case 'Tribal Nation':
      return randInt(3, 8);
    case 'Nonprofit':
      return randInt(2, 6);
  }
}

/** Emergency work gets 6 months; permanent work 18 months. */
function basePopMonths(cat: Category): number {
  return cat === 'A' || cat === 'B' ? 6 : 18;
}

let pwCounter = 10_000;

/**
 * `maturity` is how far through its lifecycle the whole account is (0 = just
 * obligated, 1 = nearly closed out). Driving project status from an
 * account-level score is what produces a realistic mix: a few accounts on the
 * finish line, most in the middle, some barely started. Drawing each project's
 * status independently would leave every account permanently half-done and no
 * account would ever be closeout-ready.
 */
function buildProject(
  account: Account,
  disaster: Disaster,
  applicant: Applicant,
  category: Category,
  maturity: number,
  amountOverride?: number,
): Project {
  pwCounter += randInt(1, 4);
  const id = `PW-${pwCounter}`;

  // Money: Cat A/B and G skew small; C, D, E, F carry the large projects.
  const medianByCat: Record<Category, number> = {
    A: 260_000,
    B: 210_000,
    C: 640_000,
    D: 840_000,
    E: 570_000,
    F: 780_000,
    G: 180_000,
    Z: 90_000,
  };
  const amount = amountOverride ?? Math.round(lognormal(medianByCat[category], 1.35) / 100) * 100;
  const obligatedAmount = Math.max(4_000, amount);
  const size: Project['size'] = obligatedAmount >= disaster.largeProjectThreshold ? 'Large' : 'Small';

  const obligationLag = randInt(70, 640);
  const obligatedOn = addDays(disaster.declaredOn, obligationLag);
  const isObligated = daysBetween(obligatedOn, AS_OF) > 0;

  // Older disasters have been through more extension rounds — without this the
  // whole back catalogue looks like it lapsed on the same day.
  const disasterAgeYears = daysBetween(disaster.declaredOn, AS_OF) / 365;
  const extensionsGranted = weighted([
    [0, Math.max(6, 55 - disasterAgeYears * 22)],
    [1, 32],
    [2, 12 + disasterAgeYears * 12],
    [3, 4 + disasterAgeYears * 10],
  ]);
  // Real PoP dates are not quantised to exact 6/18-month multiples.
  const popEndDate = addDays(
    disaster.declaredOn,
    basePopMonths(category) * 30 + extensionsGranted * 180 + randInt(-45, 60),
  );

  // FEMA-side lifecycle, driven by how far along the account is. Management
  // costs are the exception: Cat Z closes after everything it manages, so it
  // stays open far longer than the projects around it.
  const femaStatus: ProjectStatus =
    category === 'Z'
      ? weighted<ProjectStatus>([
          ['Open', Math.max(20, 96 - maturity * 62)],
          ['Closed', 4 + maturity * 52],
          ['Withdrawn', 1],
        ])
      : weighted<ProjectStatus>([
          ['Open', Math.max(6, 92 - maturity * 84)],
          ['Closed', 8 + maturity * 88],
          ['Withdrawn', 6],
        ]);
  const femaWithdrawnOn = femaStatus === 'Withdrawn' ? addDays(AS_OF, -randInt(12, 420)) : null;

  // Client system of record usually agrees — the disagreements are the point.
  let sorStatus: ProjectStatus = femaStatus;
  if (femaStatus === 'Withdrawn' && chance(0.62)) sorStatus = 'Open'; // indicator 5
  else if (femaStatus === 'Closed' && chance(0.09)) sorStatus = 'Open';
  else if (femaStatus === 'Open' && chance(0.03)) sorStatus = 'Closed';

  // Validation (large projects only).
  let validatedAmount = 0;
  let validationCompletedOn: string | null = null;
  if (size === 'Large' && isObligated) {
    const share = weighted([
      [1, 34],
      [rand() * 0.55 + 0.35, 30],
      [rand() * 0.35, 26],
      [0, 10],
    ]);
    validatedAmount = Math.round(obligatedAmount * share);
    if (share >= 1) {
      validationCompletedOn = addDays(obligatedOn, randInt(60, 320));
      if (daysBetween(validationCompletedOn, AS_OF) < 0) validationCompletedOn = AS_OF;
    }
  } else if (size === 'Small') {
    validatedAmount = obligatedAmount; // small projects close on estimate
  }

  // Funds already reimbursed. Closed projects are fully drawn; open ones trail
  // their validation progress, and the undrawn balance is what closeout unlocks.
  const drawnShare =
    femaStatus === 'Closed'
      ? 1
      : femaStatus === 'Withdrawn'
        ? rand() * 0.3
        : Math.min(1, Math.max(0, (size === 'Large' ? validatedAmount / Math.max(obligatedAmount, 1) : 1) * (0.35 + rand() * 0.6)));
  const drawnAmount = isObligated ? Math.round(obligatedAmount * drawnShare) : 0;

  // Latest quarterly report.
  const quarterlyReportedOn = addDays(AS_OF, -randInt(6, 95));
  const percentComplete = femaStatus === 'Closed' ? 100 : weighted([
    [100, 12 + maturity * 62],
    [randInt(85, 99), 30],
    [randInt(50, 84), 26],
    [randInt(5, 49), 18],
  ]);
  // Projected completion scales with the work actually left, so a project at
  // 90% doesn't report a two-year runway. Where that lands past the PoP end is
  // indicator 4.
  const remainingShare = Math.max(0, (100 - percentComplete) / 100);
  const projectedCompletionDate =
    percentComplete >= 100
      ? addDays(quarterlyReportedOn, -randInt(5, 60))
      : addDays(AS_OF, 15 + Math.round(remainingShare * randInt(90, 520)));
  const quarterly =
    femaStatus === 'Withdrawn'
      ? null
      : { reportedOn: quarterlyReportedOn, percentComplete, projectedCompletionDate };

  // Closeout prerequisites.
  const workDone = percentComplete >= 100;
  const finalInspectionOn = workDone && chance(0.82) ? addDays(AS_OF, -randInt(10, 300)) : null;
  const finalRfrPaidOn = workDone && chance(0.76) ? addDays(AS_OF, -randInt(5, 260)) : null;

  return {
    id,
    accountId: account.id,
    disasterId: disaster.id,
    applicantId: applicant.id,
    category,
    size,
    title: pick(CATEGORY_TITLES[category]),
    obligatedAmount: isObligated ? obligatedAmount : 0,
    obligatedOn: isObligated ? obligatedOn : null,
    popEndDate,
    extensionsGranted,
    closeoutExtensionOnFile: chance(0.16),
    femaStatus,
    sorStatus,
    femaWithdrawnOn,
    validatedAmount: isObligated ? validatedAmount : 0,
    validationCompletedOn,
    drawnAmount,
    quarterly,
    finalInspectionOn,
    finalRfrPaidOn,
    insuranceReconciled: chance(0.87),
    procurementReviewCleared: chance(0.91),
    closedOn: femaStatus === 'Closed' ? addDays(AS_OF, -randInt(20, 500)) : null,
  };
}

function buildRfis(projects: Project[]): Rfi[] {
  const out: Rfi[] = [];
  let n = 1;
  for (const p of projects) {
    if (p.femaStatus === 'Closed' && chance(0.85)) continue;
    const howMany = weighted([
      [0, 62],
      [1, 22],
      [2, 11],
      [3, 5],
    ]);
    for (let i = 0; i < howMany; i += 1) {
      const issuedOn = addDays(AS_OF, -randInt(5, 520));
      const dueOn = addDays(issuedOn, 30);

      // Internal tracker view.
      const internalStatus = weighted<Rfi['internalStatus']>([
        ['Open', 40],
        ['Responded', 26],
        ['Closed', 34],
      ]);

      // System-of-record view: agrees most of the time.
      let sorStatus: Rfi['sorStatus'] = internalStatus;
      const roll = rand();
      if (roll < 0.08) sorStatus = 'Closed';
      else if (roll < 0.14) sorStatus = 'Open';
      else if (roll < 0.18) sorStatus = null; // we track it, SoR has no record
      else if (roll < 0.22) sorStatus = internalStatus === 'Open' ? 'Responded' : 'Open';

      const diverged = internalStatus !== sorStatus;

      out.push({
        id: `RFI-${String(n).padStart(4, '0')}`,
        projectId: p.id,
        accountId: p.accountId,
        subject: pick(RFI_SUBJECTS),
        issuedOn,
        dueOn,
        internalStatus,
        sorStatus,
        divergedOn: diverged ? addDays(AS_OF, -randInt(3, 180)) : null,
      });
      n += 1;
    }
  }

  // A handful of RFIs that exist ONLY in the client system of record — the
  // dangerous direction, because nobody on the team is working them.
  const openProjects = projects.filter((p) => p.femaStatus === 'Open');
  for (let i = 0; i < 23; i += 1) {
    const p = pick(openProjects);
    const issuedOn = addDays(AS_OF, -randInt(8, 200));
    out.push({
      id: `RFI-${String(n).padStart(4, '0')}`,
      projectId: p.id,
      accountId: p.accountId,
      subject: pick(RFI_SUBJECTS),
      issuedOn,
      dueOn: addDays(issuedOn, 30),
      internalStatus: null,
      sorStatus: weighted<'Open' | 'Responded'>([
        ['Open', 78],
        ['Responded', 22],
      ]),
      divergedOn: addDays(AS_OF, -randInt(3, 150)),
    });
    n += 1;
  }

  return out;
}

function buildRfrs(accounts: Account[], projects: Project[]): Rfr[] {
  const out: Rfr[] = [];
  let n = 1;
  const byAccount = new Map<string, Project[]>();
  for (const p of projects) {
    const arr = byAccount.get(p.accountId) ?? [];
    arr.push(p);
    byAccount.set(p.accountId, arr);
  }

  for (const account of accounts) {
    const ps = (byAccount.get(account.id) ?? []).filter((p) => p.obligatedAmount > 0);
    if (ps.length === 0) continue;

    // Accounts near closeout have few reimbursements still moving; that is what
    // lets an account clear the "no RFR in flight" criterion at all.
    const openShare = ps.filter((p) => p.femaStatus === 'Open').length / ps.length;
    const howMany = weighted([
      [0, 18 + (1 - openShare) * 60],
      [1, 30],
      [2, 27 * openShare + 4],
      [3, 16 * openShare],
      [4, 9 * openShare],
    ]);
    for (let i = 0; i < howMany; i += 1) {
      const included = ps.filter(() => chance(0.3)).slice(0, 6);
      const projectIds = included.length ? included.map((p) => p.id) : [pick(ps).id];
      const amount = Math.round(
        projectIds.reduce((s, id) => {
          const p = ps.find((x) => x.id === id)!;
          return s + p.obligatedAmount * (0.15 + rand() * 0.5);
        }, 0),
      );

      const step = weighted<RfrStep>([
        ['Submitted', 8],
        ['Recipient Review', 16],
        ['Documentation Review', 20],
        ['Fiscal Review', 14],
        ['FEMA Review', 18],
        ['Payment Processing', 10],
        ['Paid', 14],
      ]);

      // Most records are inside target; a meaningful tail is badly overdue.
      const overdueProfile = weighted([
        [0.45, 46], // comfortably inside target
        [1.2, 21],
        [1.8, 18],
        [3.4, 15], // badly stuck
      ]);
      const target = { Submitted: 3, 'Recipient Review': 10, 'Documentation Review': 14, 'Fiscal Review': 10, 'FEMA Review': 21, 'Payment Processing': 7, Paid: 30 }[step];
      const daysInStep = Math.max(0, Math.round(target * overdueProfile * (0.7 + rand() * 0.7)));

      const stepEnteredOn = addDays(AS_OF, -daysInStep);
      const priorSteps = RFR_STEP_ORDER.indexOf(step);
      const submittedOn = addDays(stepEnteredOn, -(priorSteps * randInt(4, 18) + randInt(1, 10)));

      out.push({
        id: `RFR-${String(n).padStart(4, '0')}`,
        accountId: account.id,
        disasterId: account.disasterId,
        applicantId: account.applicantId,
        projectIds,
        amount: Math.max(5_000, amount),
        submittedOn,
        step,
        stepEnteredOn,
      });
      n += 1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ export */

export function generateDataset(): Dataset {
  const applicants = buildApplicants();
  const accounts: Account[] = [];
  const projects: Project[] = [];

  for (const disaster of DISASTERS) {
    // Not every applicant is affected by every disaster.
    const share = { 'DR-4701': 0.55, 'DR-4744': 0.7, 'DR-4808': 0.5, 'DR-4855': 0.85 }[disaster.id] ?? 0.6;
    for (const applicant of applicants) {
      if (!chance(share)) continue;
      const account: Account = {
        id: `${disaster.id}:${applicant.id}`,
        disasterId: disaster.id,
        applicantId: applicant.id,
      };
      accounts.push(account);

      // How far through closeout this account is. Older disasters skew mature.
      const disasterAge = daysBetween(disaster.declaredOn, AS_OF) / 1100;
      const maturity = Math.min(0.98, Math.max(0.05, disasterAge * (0.55 + rand() * 0.9)));

      const n = projectCountFor(applicant.type);
      const mine: Project[] = [];
      for (let i = 0; i < n; i += 1) {
        const category = weighted<Category>([
          ['A', 18],
          ['B', 22],
          ['C', 19],
          ['D', 5],
          ['E', 13],
          ['F', 9],
          ['G', 8],
        ]);
        mine.push(buildProject(account, disaster, applicant, category, maturity));
      }

      // Every account carries exactly one Category Z management-costs project.
      // Management costs run at roughly 4–8% of the account's total award, which
      // is what makes them a *large* project for big applicants — indicator 7
      // only exists because of those.
      const accountTotal = mine.reduce((s, p) => s + p.obligatedAmount, 0);
      const zAmount = Math.max(20_000, Math.round((accountTotal * (0.06 + rand() * 0.07)) / 100) * 100);
      const zProject = buildProject(account, disaster, applicant, 'Z', maturity, zAmount);
      mine.push(zProject);

      // A slice of mature accounts is deliberately parked in the closeout phase:
      // every non-Z project resolved, management costs still open. That is the
      // real shape of an account approaching closeout, and without seeding it
      // explicitly the random draw almost never produces one — indicators 7 and
      // 8 would look permanently empty for reasons that are an artefact of the
      // generator rather than a finding.
      if (maturity > 0.6 && chance(0.3)) {
        for (const p of mine) {
          if (p.category === 'Z') continue;
          if (p.femaStatus === 'Withdrawn') continue;
          p.femaStatus = 'Closed';
          p.sorStatus = chance(0.9) ? 'Closed' : 'Open';
          p.closedOn = addDays(AS_OF, -randInt(20, 400));
          p.drawnAmount = p.obligatedAmount;
          p.validatedAmount = p.obligatedAmount;
          if (p.quarterly) p.quarterly = { ...p.quarterly, percentComplete: 100 };
        }
        zProject.femaStatus = 'Open';
        zProject.sorStatus = 'Open';
        zProject.closedOn = null;
        zProject.procurementReviewCleared = chance(0.85);
        zProject.validatedAmount = chance(0.6) ? zProject.obligatedAmount : Math.round(zProject.obligatedAmount * rand());
      }

      projects.push(...mine);
    }
  }

  const rfis = buildRfis(projects);
  const rfrs = buildRfrs(accounts, projects);

  const now = new Date(`${AS_OF}T13:40:00Z`);
  return {
    asOf: AS_OF,
    sources: {
      femaGrantsPortal: iso(now) + 'T06:15:00Z',
      clientSystemOfRecord: iso(now) + 'T05:50:00Z',
      internalTracker: iso(now) + 'T12:05:00Z',
    },
    disasters: DISASTERS,
    applicants,
    accounts,
    projects,
    rfis,
    rfrs,
  };
}
