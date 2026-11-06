// OpenFEMA disaster declarations — free, no key.
// Docs: https://www.fema.gov/about/openfema/api
//
// Declarations are not solicitations, but they are where solicitations come
// from: every county designated for Public Assistance is a jurisdiction that
// will be buying debris removal, monitoring and grant-management help for
// months to years. The board uses them to flag bids in active disaster areas
// and to link a bid's DR number back to its declaration.
import type { Declaration } from '../../../src/fema/types.ts';

const BASE = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';
const PAGE = 10000;

interface Row {
  disasterNumber: number;
  state: string;
  declarationType: 'DR' | 'EM' | 'FM';
  declarationDate: string;
  incidentType: string;
  declarationTitle: string;
  designatedArea: string;
  disasterCloseoutDate?: string | null;
}

export async function fetchDeclarations(since: Date): Promise<Declaration[]> {
  const rows: Row[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const params = new URLSearchParams({
      $filter: `paProgramDeclared eq true and declarationDate ge '${since.toISOString()}'`,
      $select: 'disasterNumber,state,declarationType,declarationDate,incidentType,declarationTitle,designatedArea,disasterCloseoutDate',
      $orderby: 'declarationDate desc',
      $top: String(PAGE),
      $skip: String(skip),
    });
    const res = await fetch(`${BASE}?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OpenFEMA ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { DisasterDeclarationsSummaries?: Row[] };
    const page = body.DisasterDeclarationsSummaries ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  // One row per designated county; fold them into one record per disaster.
  const byNumber = new Map<number, Declaration>();
  for (const r of rows) {
    let d = byNumber.get(r.disasterNumber);
    if (!d) {
      d = {
        disasterNumber: r.disasterNumber,
        state: r.state,
        declarationType: r.declarationType,
        declarationDate: r.declarationDate,
        incidentType: r.incidentType,
        title: titleCase(r.declarationTitle),
        areas: [],
        closeoutDate: r.disasterCloseoutDate || undefined,
      };
      byNumber.set(r.disasterNumber, d);
    }
    const area = r.designatedArea?.trim();
    if (area && !d.areas.includes(area)) d.areas.push(area);
  }
  return [...byNumber.values()]
    .map((d) => ({ ...d, areas: d.areas.sort() }))
    .sort((a, b) => b.declarationDate.localeCompare(a.declarationDate));
}

const titleCase = (s: string) => (s ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
