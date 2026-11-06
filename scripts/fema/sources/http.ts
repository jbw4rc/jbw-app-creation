// Polite HTTP for the state and local scrapers.
//
// Every request names the scanner honestly in its User-Agent, waits between
// calls to the same portal, and times out instead of hanging a CI run. A portal
// that refuses this client is skipped rather than worked around: if a site's
// robots.txt disallows crawling, or it blocks non-browser clients, its
// postings come in through a CSV export instead (see imports.ts).
export const USER_AGENT = 'fema-pa-bid-scanner/1.0 (+https://github.com/jbw4rc/jbw-app-creation)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map<string, number>();
/** Minimum gap between requests to one host. */
const GAP_MS = 750;

export async function politeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
  const headers = new Headers(init.headers);
  headers.set('User-Agent', USER_AGENT);
  return fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(45_000) });
}

export const decodeEntities = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&emsp;|&ensp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * "11/18/2026 2:00 PM" or "11/05/2026" as a US-local wall time → ISO. Portals
 * print local time without a zone; Eastern/Central are close enough for a due
 * date to the day, so the time is read as written and stored as if UTC-5.
 */
export function usDate(s: string | undefined): string | undefined {
  const m = s?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M))?/i);
  if (!m) return undefined;
  let hour = m[4] ? Number(m[4]) % 12 : 17;
  if (m[6]?.toUpperCase() === 'PM') hour += 12;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour + 5, m[5] ? Number(m[5]) : 0));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
