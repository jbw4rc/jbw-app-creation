// THROWAWAY PROBE. Tries several free sources for NBA team "expected finish"
// signals (win-total futures, championship odds, projected standings) that a
// GitHub runner can reach, and writes findings to probe-futures-out.txt so the
// dev sandbox (no web) can read them after a git pull. Delete after use.
import { writeFileSync } from 'fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const out = [];
const log = (...a) => {
  out.push(a.join(' '));
  console.log(...a);
};

async function tryGet(label, url, opts = {}) {
  log(`\n### ${label}`);
  log(`URL ${url}`);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*', ...(opts.headers || {}) },
    });
    log(`status ${res.status} ${res.headers.get('content-type') || ''}`);
    const text = await res.text();
    log(`bytes ${text.length}`);
    // A short, safe snippet.
    log('snippet:');
    log(text.slice(0, opts.snip || 900).replace(/\s+/g, ' ').trim());
    return { ok: res.ok, text };
  } catch (e) {
    log(`ERROR ${e.message}`);
    return { ok: false, text: '' };
  }
}

// 1) ESPN hidden futures/odds API (no key). Basketball futures provider list.
await tryGet(
  'ESPN core futures index',
  'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/futures?limit=100'
);

// 2) ESPN BPI / projected standings (site API).
await tryGet(
  'ESPN BPI standings',
  'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?level=3'
);

// 3) ESPN teams odds provider (per-team futures sometimes here).
await tryGet(
  'ESPN scoreboard (season probe)',
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
);

// 4) Tankathon projected standings / draft order (HTML).
await tryGet('Tankathon standings', 'https://www.tankathon.com/', { snip: 600 });

// 5) Basketball-Reference preseason odds page (if any).
await tryGet(
  'BBRef 2027 preview',
  'https://www.basketball-reference.com/leagues/NBA_2027.html',
  { snip: 400 }
);

// 6) The Odds API sample (needs key, but check reachability/shape).
await tryGet(
  'the-odds-api sports list',
  'https://api.the-odds-api.com/v4/sports/?apiKey=demo'
);

writeFileSync('probe-futures-out.txt', out.join('\n'));
log('\n\nWROTE probe-futures-out.txt');
