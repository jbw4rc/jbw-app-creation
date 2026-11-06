// Shared shapes for the FEMA PA bid scanner. The scraper (scripts/fema) writes
// a Feed into src/fema/data/feed.ts; the page reads it. Nothing here touches
// the network, so both sides can import it.

/** What kind of FEMA Public Assistance work a solicitation is for. */
export type Category =
  | 'debris-removal'      // Cat A — collection, hauling, reduction, hazardous trees
  | 'debris-monitoring'   // Cat A oversight — load tickets, tower monitors
  | 'pa-consulting'       // grant management, cost recovery, PW/closeout support
  | 'emergency-measures'  // Cat B — protective measures, sheltering, temp power
  | 'permanent-work'      // Cat C–G — roads, bridges, water control, buildings, utilities, parks
  | 'engineering'         // damage assessment, A/E design for disaster repairs
  | 'mitigation';         // 406 / HMGP — adjacent to PA, not PA itself

export type Tier = 'core' | 'likely' | 'adjacent';

export type SourceId = 'sam' | 'rss';

export interface Opportunity {
  /** Stable across runs: `${source}:${native id}`. */
  id: string;
  source: SourceId;
  /** Human name of the feed or portal it came from. */
  sourceName: string;
  title: string;
  agency: string;
  /** Two-letter postal code where the work is, when known. */
  state?: string;
  place?: string;
  /** solicitation, presolicitation, sources sought, RFQ, RFP… */
  noticeType?: string;
  solicitationNumber?: string;
  naics?: string;
  setAside?: string;
  postedDate?: string;   // ISO
  dueDate?: string;      // ISO
  url: string;
  /** Short plain-text summary, if the source gave one. */
  summary?: string;
  // ---- added by the classifier ----
  score: number;          // 0–100
  tier: Tier;
  categories: Category[];
  /** The phrases that earned the score — shown in the UI so a read is auditable. */
  matched: string[];
  /** FEMA disaster numbers named in the text, e.g. 4834. */
  disasterNumbers: number[];
  // ---- bookkeeping ----
  firstSeen: string;      // ISO — when the scanner first saw it
  lastSeen: string;       // ISO
}

/** One FEMA disaster declaration that includes Public Assistance. */
export interface Declaration {
  disasterNumber: number;
  state: string;
  declarationType: 'DR' | 'EM' | 'FM';
  declarationDate: string;
  incidentType: string;
  title: string;
  /** Designated counties/areas with PA, de-duplicated. */
  areas: string[];
  closeoutDate?: string;
}

export interface SourceStatus {
  id: string;
  name: string;
  ok: boolean;
  /** Raw records fetched before relevance filtering. */
  fetched: number;
  /** Records that cleared the relevance bar. */
  kept: number;
  message?: string;
  ranAt: string;
}

export interface Feed {
  /** null until the scanner has run once — the page then shows sample data. */
  generatedAt: string | null;
  opportunities: Opportunity[];
  declarations: Declaration[];
  sources: SourceStatus[];
}
