// SAMPLE data. The page shows it only while the live feed has never been
// built (feed.generatedAt === null), under a banner that says so. Every agency
// and posting here is invented. They are run through the real classifier, so
// the sample shows what the engine does with each kind of title, traps included
// (the IT "disaster recovery" and welfare "public assistance" rows are scored
// and dropped).
import { classify } from '../lib/classify';
import type { Declaration, Feed, Opportunity } from '../types';

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();

type Raw = Omit<Opportunity, 'score' | 'tier' | 'categories' | 'matched' | 'disasterNumbers' | 'firstSeen' | 'lastSeen'> & { seen: number };

const RAW: Raw[] = [
  { id: 'sample:1', source: 'rss', sourceName: 'Sample County bid board', title: 'RFP 26-114 Disaster Debris Removal and Disposal Services (Pre-Positioned Contract)', agency: 'Sample County, FL', state: 'FL', noticeType: 'RFP', postedDate: at(-2), dueDate: at(12), url: '#', summary: 'Vegetative and C&D debris collection, hauling, reduction, hazardous trees and leaners & hangers. Work is eligible for FEMA Public Assistance Category A reimbursement; contractor must comply with 2 CFR 200.', seen: -2 },
  { id: 'sample:2', source: 'rss', sourceName: 'Example City purchasing', title: 'RFQ – Debris Monitoring Services, Hurricane Response', agency: 'City of Example, NC', state: 'NC', noticeType: 'RFQ', postedDate: at(-1), dueDate: at(6), url: '#', summary: 'Tower monitors, roving monitors and load ticket management for FEMA DR-4998 debris operations.', seen: -1 },
  { id: 'sample:3', source: 'rss', sourceName: 'Demo Parish procurement', title: 'Request for Proposals: FEMA Public Assistance Grant Management and Consulting Services', agency: 'Demo Parish, LA', state: 'LA', noticeType: 'RFP', postedDate: at(-5), dueDate: at(19), url: '#', summary: 'Project worksheet development, cost recovery, appeals and closeout under the Stafford Act.', seen: -5 },
  { id: 'sample:4', source: 'sam', sourceName: 'SAM.gov', title: 'Emergency Protective Measures – Temporary Power and Generators, DR-4999-FL', agency: 'Department of Homeland Security — Federal Emergency Management Agency', state: 'FL', noticeType: 'Combined Synopsis/Solicitation', naics: '561990', postedDate: at(-3), dueDate: at(3), url: '#', seen: -3 },
  { id: 'sample:5', source: 'rss', sourceName: 'Sample County bid board', title: 'ITB Flood Damage Repairs to Riverside Park Bridge and Culverts', agency: 'Sample County, TN', state: 'TN', noticeType: 'ITB', postedDate: at(-8), dueDate: at(9), url: '#', summary: 'Permanent work under FEMA Category C. Federally declared disaster.', seen: -8 },
  { id: 'sample:6', source: 'sam', sourceName: 'SAM.gov', title: 'Sources Sought: Hurricane Damage Assessment and Engineering Inspections', agency: 'Department of the Army — U.S. Army Corps of Engineers', state: 'PR', noticeType: 'Sources Sought', naics: '541330', postedDate: at(-4), dueDate: at(14), url: '#', seen: -4 },
  { id: 'sample:7', source: 'rss', sourceName: 'Example Water District', title: 'Hazard Mitigation Plan Update', agency: 'Example Water District, CA', state: 'CA', noticeType: 'RFP', postedDate: at(-10), dueDate: at(25), url: '#', seen: -10 },
  { id: 'sample:8', source: 'rss', sourceName: 'Demo Schools', title: 'Debris Removal – Storm Clean-Up at Campus Grounds', agency: 'Demo Unified Schools, TX', state: 'TX', noticeType: 'RFQ', postedDate: at(-20), dueDate: at(-4), url: '#', seen: -20 },
  // Traps — these score below the bar and never appear on the board.
  { id: 'sample:9', source: 'sam', sourceName: 'SAM.gov', title: 'Disaster Recovery as a Service (DRaaS) for Data Center Backup', agency: 'Example Agency', url: '#', seen: -1 },
  { id: 'sample:10', source: 'rss', sourceName: 'Example State HHS', title: 'Public Assistance Eligibility System – SNAP and TANF Modernization', agency: 'Example State HHS', url: '#', seen: -1 },
  { id: 'sample:11', source: 'rss', sourceName: 'Example City purchasing', title: 'Stormwater Pipe Repairs, Phase 2', agency: 'City of Example', url: '#', seen: -1 },
];

const opportunities: Opportunity[] = RAW.flatMap(({ seen, ...r }) => {
  const c = classify(r);
  if (!c.tier) return [];
  return [{ ...r, score: c.score, tier: c.tier, categories: c.categories, matched: c.matched, disasterNumbers: c.disasterNumbers, firstSeen: at(seen), lastSeen: at(0) }];
});

const declarations: Declaration[] = [
  { disasterNumber: 4999, state: 'FL', declarationType: 'DR', declarationDate: at(-40), incidentType: 'Hurricane', title: 'Hurricane Sample', areas: ['Sample (County)', 'Example (County)', 'Demo (County)'] },
  { disasterNumber: 4998, state: 'NC', declarationType: 'DR', declarationDate: at(-55), incidentType: 'Hurricane', title: 'Hurricane Sample', areas: ['Example (County)'] },
  { disasterNumber: 4996, state: 'LA', declarationType: 'DR', declarationDate: at(-90), incidentType: 'Severe Storm', title: 'Severe Storms And Flooding', areas: ['Demo (Parish)'] },
  { disasterNumber: 4990, state: 'TN', declarationType: 'DR', declarationDate: at(-150), incidentType: 'Flood', title: 'Severe Storms, Straight-Line Winds, And Flooding', areas: ['Sample (County)', 'Other (County)'] },
  { disasterNumber: 3650, state: 'TX', declarationType: 'EM', declarationDate: at(-200), incidentType: 'Severe Storm', title: 'Severe Winter Storm', areas: ['Demo (County)'] },
];

export const sampleFeed: Feed = {
  generatedAt: at(0),
  opportunities: opportunities.sort((a, b) => b.score - a.score),
  declarations,
  sources: [],
};

/** How many sample rows the classifier rejected — shown in the banner as proof the traps work. */
export const sampleRejected = RAW.length - opportunities.length;
