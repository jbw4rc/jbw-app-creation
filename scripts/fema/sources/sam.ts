// SAM.gov Get Opportunities API (v2) — every federal solicitation, nationwide.
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
//
// BUDGET. A SAM.gov personal API key with no entity role gets 10 requests a
// day; a key tied to a registered entity gets 1,000. The scanner defaults to a
// budget that fits the free tier (SAM_MAX_REQUESTS, default 8) and leans on
// accumulation: each daily run only asks for what was posted since the last
// one, so the board grows into a full picture instead of re-reading it.
//
// The public endpoint searches titles, not full descriptions (the description
// is a separate authenticated fetch per notice, which the budget cannot
// afford), so queries are title keywords plus PA-heavy NAICS codes.
import type { RawOpportunity } from './types.ts';

const BASE = 'https://api.sam.gov/opportunities/v2/search';
const PAGE = 1000;

/** Notice types worth bidding on or preparing for. */
const PTYPES = 'o,k,p,r,s'; // solicitation, combined, presolicitation, sources sought, special notice

export interface SamQuery {
  label: string;
  title?: string;
  ncode?: string;
}

// Ordered by yield: the budget is spent top-down, so the most productive
// queries always run even when the request allowance is small.
export const SAM_QUERIES: SamQuery[] = [
  { label: 'title: debris', title: 'debris' },
  { label: 'title: disaster', title: 'disaster' },
  { label: 'title: FEMA', title: 'FEMA' },
  { label: 'title: hurricane', title: 'hurricane' },
  { label: 'title: storm', title: 'storm' },
  { label: 'title: flood', title: 'flood' },
  { label: 'NAICS 562119', ncode: '562119' },
  { label: 'title: emergency', title: 'emergency' },
];

const mmddyyyy = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;

interface SamNotice {
  noticeId: string;
  title?: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  postedDate?: string;
  type?: string;
  responseDeadLine?: string | null;
  naicsCode?: string;
  typeOfSetAsideDescription?: string | null;
  active?: string;
  uiLink?: string;
  officeAddress?: { city?: string; state?: string };
  placeOfPerformance?: { city?: { name?: string }; state?: { code?: string; name?: string } };
}

/** "HOMELAND SECURITY, DEPARTMENT OF.FEDERAL EMERGENCY MANAGEMENT AGENCY.REGION 4" → readable. */
function agencyName(path?: string): string {
  if (!path) return 'Federal agency';
  const parts = path.split('.').map((p) => p.trim()).filter(Boolean);
  const tidy = (s: string) =>
    s.replace(/^(.*), (DEPARTMENT|DEPT) OF( THE)?$/i, 'Department of$3 $1')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\b(Of|The|And|For)\b/g, (w) => w.toLowerCase());
  return parts.length > 1 ? `${tidy(parts[0])} — ${tidy(parts[parts.length - 1])}` : tidy(parts[0]);
}

export interface SamResult {
  records: RawOpportunity[];
  requests: number;
  message: string;
  /** True when the run stopped before every query finished (budget or rate limit). */
  partial: boolean;
}

export async function fetchSam(apiKey: string, postedFrom: Date, postedTo: Date, maxRequests: number): Promise<SamResult> {
  const byId = new Map<string, RawOpportunity>();
  let requests = 0;
  const notes: string[] = [];
  let partial = false;

  for (const q of SAM_QUERIES) {
    let offset = 0;
    for (;;) {
      if (requests >= maxRequests) {
        notes.push(`budget of ${maxRequests} requests reached before "${q.label}"`);
        partial = true;
        return finish();
      }
      const params = new URLSearchParams({
        api_key: apiKey,
        postedFrom: mmddyyyy(postedFrom),
        postedTo: mmddyyyy(postedTo),
        ptype: PTYPES,
        limit: String(PAGE),
        offset: String(offset),
      });
      if (q.title) params.set('title', q.title);
      if (q.ncode) params.set('ncode', q.ncode);
      requests++;
      const res = await fetch(`${BASE}?${params}`, { headers: { Accept: 'application/json' } });
      if (res.status === 429) {
        notes.push(`rate limited at "${q.label}" — the daily allowance is spent`);
        partial = true;
        return finish();
      }
      if (!res.ok) throw new Error(`SAM.gov ${res.status} on "${q.label}": ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { totalRecords?: number; opportunitiesData?: SamNotice[] };
      const rows = body.opportunitiesData ?? [];
      for (const n of rows) {
        if (!n.noticeId || n.active === 'No') continue;
        const pop = n.placeOfPerformance;
        byId.set(n.noticeId, {
          id: `sam:${n.noticeId}`,
          source: 'sam',
          sourceName: 'SAM.gov',
          title: (n.title ?? '').trim() || '(untitled notice)',
          agency: agencyName(n.fullParentPathName),
          state: pop?.state?.code || n.officeAddress?.state || undefined,
          place: [pop?.city?.name, pop?.state?.name].filter(Boolean).join(', ') || undefined,
          noticeType: n.type,
          solicitationNumber: n.solicitationNumber || undefined,
          naics: n.naicsCode || undefined,
          setAside: n.typeOfSetAsideDescription || undefined,
          postedDate: n.postedDate ? new Date(n.postedDate).toISOString() : undefined,
          dueDate: n.responseDeadLine ? new Date(n.responseDeadLine).toISOString() : undefined,
          url: n.uiLink || `https://sam.gov/opp/${n.noticeId}/view`,
        });
      }
      offset += rows.length;
      if (rows.length < PAGE || offset >= (body.totalRecords ?? 0)) break;
    }
  }
  return finish();

  function finish(): SamResult {
    return { records: [...byId.values()], requests, partial, message: [`${requests} requests`, ...notes].join('; ') };
  }
}
