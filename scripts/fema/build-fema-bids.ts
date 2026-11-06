// Scan every configured source for FEMA Public Assistance solicitations and
// write src/fema/data/feed.ts. Runs daily in CI (.github/workflows/build-fema-bids.yml).
//
//   npx tsx scripts/fema/build-fema-bids.ts
//
// Env:
//   SAM_API_KEY        SAM.gov public API key. Without it SAM.gov is skipped
//                      and the status panel says so.
//   SAM_MAX_REQUESTS   request budget per run (default 8; the free key allows 10/day)
//   LOOKBACK_DAYS      how far back the first run reads (default 60)
//
// The feed ACCUMULATES. Each run asks only for what was posted since the last
// run (plus a two-day overlap for late-indexed notices), merges it into what is
// already on file, re-scores everything with the current classifier, and prunes
// postings that closed more than a month ago. A source that fails keeps its
// previous postings on the board; only its status turns red.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { classify } from '../../src/fema/lib/classify.ts';
import type { Declaration, Feed, Opportunity, SourceStatus } from '../../src/fema/types.ts';
import type { RawOpportunity } from './sources/types.ts';
import { fetchSam } from './sources/sam.ts';
import { fetchDeclarations } from './sources/openfema.ts';
import { fetchFeed, type FeedConfig } from './sources/rss.ts';

const OUT = 'src/fema/data/feed.ts';
const FEEDS = 'scripts/fema/feeds.json';
const DAY = 86_400_000;

const now = new Date();
const nowIso = now.toISOString();
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS ?? 60);
const OVERLAP_DAYS = 2;
/** Declarations older than this have mostly finished buying. */
const DECLARATION_YEARS = 3;
/** Keep a closed posting this long, so a recent award is still findable. */
const KEEP_AFTER_DUE_DAYS = 30;
/** A posting with no due date leaves once its source stops listing it for this long. */
const KEEP_UNDATED_DAYS = 60;

function loadPrevious(): Feed {
  if (!existsSync(OUT)) return { generatedAt: null, opportunities: [], declarations: [], sources: [] };
  const src = readFileSync(OUT, 'utf8');
  // The body is one JSON object after `export const feed: Feed = `.
  const json = src.slice(src.indexOf('= {') + 2, src.lastIndexOf('}') + 1);
  return JSON.parse(json) as Feed;
}

const prev = loadPrevious();
const prevStatus = new Map(prev.sources.map((s) => [s.id, s]));
const statuses: SourceStatus[] = [];
const fresh: RawOpportunity[] = [];

/** Read window for an accumulating source: since its last good run, or the first-run lookback. */
function windowStart(sourceId: string): Date {
  const last = prevStatus.get(sourceId);
  const floor = now.getTime() - LOOKBACK_DAYS * DAY;
  if (!last?.ok) return new Date(floor);
  return new Date(Math.max(floor, new Date(last.ranAt).getTime() - OVERLAP_DAYS * DAY));
}

const keptCount = (records: RawOpportunity[]) => records.filter((r) => classify(r).tier).length;

// ---------------- SAM.gov ----------------
{
  const key = process.env.SAM_API_KEY;
  const status: SourceStatus = { id: 'sam', name: 'SAM.gov (federal)', ok: false, fetched: 0, kept: 0, ranAt: nowIso };
  if (!key) {
    status.message = 'SAM_API_KEY is not set — add it as a repository secret to scan federal notices.';
  } else {
    try {
      const from = windowStart('sam');
      const r = await fetchSam(key, from, now, Number(process.env.SAM_MAX_REQUESTS ?? 8));
      fresh.push(...r.records);
      // A partial read keeps what it found but is not marked ok, so the next
      // run re-reads the same window instead of skipping the queries it missed.
      Object.assign(status, {
        ok: !r.partial,
        fetched: r.records.length,
        kept: keptCount(r.records),
        message: `posted ${from.toISOString().slice(0, 10)} → today; ${r.message}`,
      });
    } catch (e) {
      status.message = (e as Error).message;
    }
  }
  console.log(`SAM.gov: ${status.ok ? 'ok' : 'FAILED'} — ${status.message ?? ''}`);
  statuses.push(status);
}

// ---------------- RSS / Atom bid boards ----------------
{
  const cfg = existsSync(FEEDS) ? (JSON.parse(readFileSync(FEEDS, 'utf8')) as { feeds?: FeedConfig[] }) : {};
  const feeds = (cfg.feeds ?? []).filter((f) => f.enabled !== false && f.url);
  for (const f of feeds) {
    const status: SourceStatus = { id: `rss:${f.url}`, name: f.name, ok: false, fetched: 0, kept: 0, ranAt: nowIso };
    try {
      const records = await fetchFeed(f);
      fresh.push(...records);
      Object.assign(status, { ok: true, fetched: records.length, kept: keptCount(records) });
    } catch (e) {
      status.message = (e as Error).message;
    }
    console.log(`feed ${f.name}: ${status.ok ? `${status.kept}/${status.fetched} kept` : `FAILED — ${status.message}`}`);
    statuses.push(status);
  }
  if (feeds.length === 0) console.log(`no state/local feeds configured in ${FEEDS}`);
}

// ---------------- OpenFEMA declarations ----------------
let declarations: Declaration[] = prev.declarations;
{
  const status: SourceStatus = { id: 'openfema', name: 'OpenFEMA declarations', ok: false, fetched: 0, kept: 0, ranAt: nowIso };
  try {
    const since = new Date(now);
    since.setUTCFullYear(since.getUTCFullYear() - DECLARATION_YEARS);
    declarations = await fetchDeclarations(since);
    Object.assign(status, { ok: true, fetched: declarations.length, kept: declarations.length, message: `PA declarations since ${since.toISOString().slice(0, 10)}` });
  } catch (e) {
    status.message = `${(e as Error).message} — keeping the previous ${prev.declarations.length}`;
  }
  console.log(`OpenFEMA: ${status.ok ? `${declarations.length} PA declarations` : `FAILED — ${status.message}`}`);
  statuses.push(status);
}

// ---------------- merge, re-score, prune ----------------
const merged = new Map<string, Opportunity>();
const place = (raw: RawOpportunity, firstSeen: string, lastSeen: string) => {
  const c = classify(raw);
  if (!c.tier) return;
  merged.set(raw.id, { ...raw, score: c.score, tier: c.tier, categories: c.categories, matched: c.matched, disasterNumbers: c.disasterNumbers, firstSeen, lastSeen });
};
for (const o of prev.opportunities) place(o, o.firstSeen, o.lastSeen);
for (const r of fresh) place(r, merged.get(r.id)?.firstSeen ?? nowIso, nowIso);

const opportunities = [...merged.values()]
  .filter((o) =>
    o.dueDate
      ? new Date(o.dueDate).getTime() > now.getTime() - KEEP_AFTER_DUE_DAYS * DAY
      : new Date(o.lastSeen).getTime() > now.getTime() - KEEP_UNDATED_DAYS * DAY
  )
  .sort((a, b) => b.score - a.score || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'));

// A source that was not run this time (a feed removed from the config) drops
// out of the status panel; its postings age out through the rules above.
const feed: Feed = { generatedAt: nowIso, opportunities, declarations, sources: statuses };

writeFileSync(
  OUT,
  `// GENERATED by scripts/fema/build-fema-bids.ts — do not edit by hand.\n` +
    `// The scanner reads this file back on its next run and merges into it.\n` +
    `import type { Feed } from '../types';\n\n` +
    `export const feed: Feed = ${JSON.stringify(feed, null, 2)};\n`
);
const newToday = opportunities.filter((o) => o.firstSeen === nowIso).length;
console.log(`\nwrote ${OUT}: ${opportunities.length} opportunities (${newToday} new), ${declarations.length} declarations`);
