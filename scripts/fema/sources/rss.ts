// Generic RSS / Atom adapter for state and local bid boards.
//
// Most FEMA PA work is bought by the subrecipient — the county, city, school
// district or utility that took the damage — not by the federal government, so
// it never reaches SAM.gov. Many of those buyers publish their bid board as a
// feed (CivicPlus "Bid Postings" pages, for example, expose one at
// /RSSFeed.aspx?ModID=76). List feeds in scripts/fema/feeds.json and the
// scanner reads them all and keeps the ones that score as PA work.
//
// No XML dependency: bid feeds are small and flat, and a tolerant regex reader
// copes better with the malformed markup some portals emit than a strict parser.
import type { RawOpportunity } from './types.ts';

export interface FeedConfig {
  name: string;
  url: string;
  /** Two-letter state; feeds are agency-specific so the state is known up front. */
  state?: string;
  agency?: string;
  enabled?: boolean;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : undefined;
}

/** Best-effort "Closing Date: 12/01/2026 2:00 PM" style due dates in the item text. */
export function findDueDate(text: string): string | undefined {
  const m = text.match(
    /\b(?:due|closing|closes|close date|deadline|bid opening|opening date|submittals? due|responses? due)\b[^0-9a-z]{0,20}(?:date[^0-9a-z]{0,5})?((?:\d{1,2}\/\d{1,2}\/\d{2,4})|(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}))/i
  );
  if (!m) return undefined;
  const d = new Date(m[1].replace(/\bsept\b/i, 'sep'));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function parseFeed(xml: string, cfg: FeedConfig): RawOpportunity[] {
  const items = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return items.map((block, i) => {
    const title = decode(tag(block, 'title') ?? '');
    const linkHref = block.match(/<link\b[^>]*href="([^"]+)"/i)?.[1];
    const link = decode(linkHref ?? tag(block, 'link') ?? '') || cfg.url;
    const summary = decode(tag(block, 'description') ?? tag(block, 'summary') ?? tag(block, 'content') ?? '');
    const guid = decode(tag(block, 'guid') ?? tag(block, 'id') ?? '') || link || `${title}#${i}`;
    const pub = decode(tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? '');
    const posted = pub ? new Date(pub) : undefined;
    return {
      id: `rss:${cfg.url}#${guid}`,
      source: 'rss' as const,
      sourceName: cfg.name,
      title: title || '(untitled posting)',
      agency: cfg.agency ?? cfg.name,
      state: cfg.state,
      url: link,
      summary: summary.slice(0, 600) || undefined,
      postedDate: posted && !Number.isNaN(posted.getTime()) ? posted.toISOString() : undefined,
      dueDate: findDueDate(`${title} ${summary}`),
    };
  });
}

export async function fetchFeed(cfg: FeedConfig): Promise<RawOpportunity[]> {
  const res = await fetch(cfg.url, {
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml', 'User-Agent': 'fema-pa-bid-scanner/1.0' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), cfg);
}
