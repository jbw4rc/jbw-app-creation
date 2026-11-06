// North Carolina — eVP, the state's electronic Vendor Portal.
// https://evp.nc.gov/solicitations/
//
// eVP carries state agencies AND a long list of local buyers: cities, counties,
// school systems (Raleigh, Asheville, Mecklenburg, Cumberland …), which is
// exactly where post-Helene PA work gets bought.
//
// The page is a Power Pages portal; its public solicitations grid loads from a
// JSON endpoint the page itself calls anonymously. The scanner does what the
// page does: load it, take the grid's view configuration and the anti-forgery
// token the portal issues to every visitor, and page through newest-first until
// it passes the read window. robots.txt sets no rules.
import type { RawOpportunity } from './types.ts';
import { decodeEntities, politeFetch, usDate } from './http.ts';

const BASE = 'https://evp.nc.gov';
const PAGE_SIZE = 100;
/** Backstop; the window check normally stops the read after a few pages. */
const MAX_PAGES = 25;

interface Attr { Name: string; DisplayValue?: unknown; FormattedValue?: string }
interface GridRecord { Id: string; Attributes: Attr[] }
interface GridPage { Records: GridRecord[]; MoreRecords: boolean; ItemCount?: number }

/** Cookie header from a response's Set-Cookie lines. */
function cookies(res: Response): string {
  const raw = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  return raw.map((c) => c.split(';')[0]).join('; ');
}

const joinCookies = (...parts: string[]) => parts.filter(Boolean).join('; ');

export function parseLayout(html: string): { grid: string; config: string } {
  const grid = html.match(/_services\/entity-grid-data\.json\/[0-9a-f-]+/)?.[0];
  const rawLayout = html.match(/data-view-layouts="([^"]+)"/)?.[1];
  if (!grid || !rawLayout) throw new Error('eVP grid config not found — the page layout may have changed');
  const unescaped = decodeEntities(rawLayout);
  let layouts: { Base64SecureConfiguration: string }[];
  try {
    layouts = JSON.parse(Buffer.from(unescaped, 'base64').toString('utf8'));
  } catch {
    layouts = JSON.parse(unescaped);
  }
  return { grid, config: layouts[0].Base64SecureConfiguration };
}

function attr(r: GridRecord, n: string): string | undefined {
  const a = r.Attributes.find((x) => x.Name === n);
  const v = a?.DisplayValue ?? a?.FormattedValue;
  return typeof v === 'string' ? v.trim() : undefined;
}

export function recordToRaw(r: GridRecord): RawOpportunity | null {
  const get = (n: string) => attr(r, n);
  const status = get('statuscode');
  if (status && status !== 'Open') return null;
  const number = get('evp_solicitationnbr');
  let title = get('evp_name') ?? '';
  // Titles often repeat the number: "54-TJK-04-PR39988, STATE ROUTE MOWING…".
  if (number && title.startsWith(number)) title = title.slice(number.length).replace(/^[\s,:–-]+/, '');
  return {
    id: `ncevp:${r.Id}`,
    source: 'state',
    sourceName: 'North Carolina eVP',
    title: title || number || '(untitled solicitation)',
    agency: titleCase(get('owningbusinessunit') ?? 'State of North Carolina'),
    state: 'NC',
    noticeType: 'Solicitation',
    solicitationNumber: number,
    summary: get('evp_description')?.slice(0, 600),
    postedDate: usDate(get('evp_posteddate')),
    dueDate: usDate(get('evp_opendate')),
    url: `${BASE}/solicitations/details/?id=${r.Id}`,
  };
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Of|And|The|For)\b/g, (w) => w.toLowerCase()).replace(/\bNc\b/g, 'NC');

export async function fetchNcEvp(since: Date): Promise<{ records: RawOpportunity[]; message: string }> {
  const page = await politeFetch(`${BASE}/solicitations/`);
  if (!page.ok) throw new Error(`eVP page HTTP ${page.status}`);
  const c1 = cookies(page);
  const { grid, config } = parseLayout(await page.text());

  const tokRes = await politeFetch(`${BASE}/_layout/tokenhtml`, { headers: { Cookie: c1 } });
  const cookie = joinCookies(c1, cookies(tokRes));
  const token = (await tokRes.text()).match(/value="([^"]+)"/)?.[1];
  if (!token) throw new Error('eVP did not issue a request token');

  const out: RawOpportunity[] = [];
  let pages = 0;
  for (let n = 1; n <= MAX_PAGES; n++) {
    const res = await politeFetch(`${BASE}/${grid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        __RequestVerificationToken: token,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookie,
      },
      body: JSON.stringify({
        base64SecureConfiguration: config,
        sortExpression: 'evp_posteddate DESC',
        search: '',
        page: n,
        pageSize: PAGE_SIZE,
        pagingCookie: '',
        filter: null,
        metaFilter: null,
        timezoneOffset: 300,
        customParameters: [],
      }),
    });
    if (!res.ok) throw new Error(`eVP grid HTTP ${res.status} on page ${n}`);
    const body = (await res.json()) as GridPage;
    pages++;
    let older = 0;
    for (const r of body.Records) {
      // Judge age from every record, open or not: closed ones fill the older
      // pages, and they are what tells the reader it has left the window.
      const posted = usDate(attr(r, 'evp_posteddate'));
      if (posted && new Date(posted) < since) older++;
      const o = recordToRaw(r);
      if (o) out.push(o);
    }
    // Newest-first: once a whole page predates the window, stop reading.
    if (!body.MoreRecords || older === body.Records.length) break;
  }
  return { records: out, message: `${pages} page${pages === 1 ? '' : 's'} read` };
}
