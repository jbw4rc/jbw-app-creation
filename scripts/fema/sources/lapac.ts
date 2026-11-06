// Louisiana — LaPAC, the Office of State Procurement's bid network.
// https://wwwcfprd.doa.louisiana.gov/osp/lapac/pubMain.cfm
//
// LaPAC lists open bids per department as plain HTML. The scanner reads the
// department index, then each department's listing (about 40 requests, paced),
// and lets the classifier pick out the PA work. robots.txt allows it.
//
// Coverage: state agencies and universities, plus the parishes, cities and
// districts that choose to post there (listed as "Non State - …"). Many
// locals also or only post on their own portals, which LaPAC does not carry.
import type { RawOpportunity } from './types.ts';
import { decodeEntities, politeFetch, usDate } from './http.ts';

const BASE = 'https://wwwcfprd.doa.louisiana.gov/osp/lapac/';

export function parseDeptIndex(html: string): string[] {
  return [...new Set([...html.matchAll(/dspBid\.cfm\?search=department&(?:amp;)?term=(\d+)/g)].map((m) => m[1]))];
}

export function parseDeptListing(html: string): RawOpportunity[] {
  const dept = decodeEntities(html.match(/Bids by Department<\/h1>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? '').replace(/^\+\s*/, '');
  // Headers read "State - Transportation and Development" or
  // "Non State - City of Mandeville": LaPAC carries local buyers too.
  const agency = dept.replace(/^(?:Non )?State - /i, '') || 'State of Louisiana';
  const rows = html.match(/<tr class="(?:odd|even)Row">[\s\S]*?<\/tr>/g) ?? [];
  const out: RawOpportunity[] = [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 4) continue;
    const bidNo = decodeEntities(cells[0]);
    if (!bidNo) continue;
    // The description is the text before the "Original:" document links.
    const title = decodeEntities(cells[1].split(/<strong>\s*Original:/i)[0]);
    const doc = cells[1].match(/Original:<\/strong>\s*<a[^>]*href="([^"]+)"/i)?.[1];
    out.push({
      id: `lapac:${bidNo}`,
      source: 'state',
      sourceName: 'Louisiana LaPAC',
      title: title || `Bid ${bidNo}`,
      agency,
      state: 'LA',
      noticeType: 'Bid',
      solicitationNumber: bidNo,
      postedDate: usDate(decodeEntities(cells[2])),
      dueDate: usDate(decodeEntities(cells[3])),
      url: doc ? new URL(doc, BASE).toString() : `${BASE}srchopen.cfm`,
    });
  }
  return out;
}

export async function fetchLapac(): Promise<{ records: RawOpportunity[]; message: string }> {
  const res = await politeFetch(`${BASE}deptbids.cfm`);
  if (!res.ok) throw new Error(`LaPAC index HTTP ${res.status}`);
  const depts = parseDeptIndex(await res.text());
  if (depts.length === 0) throw new Error('LaPAC index had no departments — the page layout may have changed');
  const byId = new Map<string, RawOpportunity>();
  let failed = 0;
  for (const term of depts) {
    try {
      const r = await politeFetch(`${BASE}dspBid.cfm?search=department&term=${term}`);
      if (!r.ok) throw new Error(String(r.status));
      for (const o of parseDeptListing(await r.text())) byId.set(o.id, o);
    } catch {
      failed++;
    }
  }
  if (failed === depts.length) throw new Error('every LaPAC department listing failed');
  return { records: [...byId.values()], message: `${depts.length} departments${failed ? `, ${failed} failed` : ''}` };
}
