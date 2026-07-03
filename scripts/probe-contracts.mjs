// THROWAWAY PROBE. Checks candidate sources for PROJECTED free-agent contract
// values (Spotrac market value, HoopsHype, RealGM). Writes probe-contracts-out.txt.
import { writeFileSync } from 'fs';

const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const out = [];
const log = (...a) => out.push(a.join(' '));
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function probe(label, url, opts = {}) {
  log(`\n\n######## ${label}\n${url}`);
  try {
    const r = await fetch(url, { headers: H, redirect: 'follow' });
    const t = await r.text();
    log(`status ${r.status} ${r.headers.get('content-type') || ''} · bytes ${t.length} · final ${r.url}`);
    if (r.status !== 200) {
      log('snippet: ' + strip(t).slice(0, 300));
      return;
    }
    for (const w of ['market value', 'market-value', 'projected', 'prediction', 'free agent', 'contract', 'AAV', 'per year']) {
      const i = t.toLowerCase().indexOf(w.toLowerCase());
      if (i >= 0) log(`  ~"${w}" @${i}: ${strip(t.slice(i - 30, i + 90))}`);
    }
    const tables = t.match(/<table[\s\S]*?<\/table>/gi) || [];
    log(`  tables: ${tables.length}`);
    tables.slice(0, 3).forEach((tbl, i) => {
      const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      log(`   [${i}] rows=${rows.length} hdr: ${strip(rows[0] || '').slice(0, 160)}`);
      if (rows[1]) log(`       row1: ${strip(rows[1]).slice(0, 160)}`);
    });
    // JSON blobs?
    for (const m of ['__NEXT_DATA__', 'application/json', 'window.__']) {
      if (t.includes(m)) log(`  has ${m}`);
    }
  } catch (e) {
    log(`  ERROR ${e.message}`);
  }
}

await probe('Spotrac NBA free agents', 'https://www.spotrac.com/nba/free-agents/');
await probe('Spotrac NBA free agents (year)', 'https://www.spotrac.com/nba/free-agents/2026/');
await probe('Spotrac player market value (Jokic)', 'https://www.spotrac.com/nba/denver-nuggets/nikola-jokic/market-value/');
await probe('HoopsHype free agents', 'https://hoopshype.com/nba-free-agents/');
await probe('RealGM free agents', 'https://basketball.realgm.com/nba/free-agents');

writeFileSync('probe-contracts-out.txt', out.join('\n'));
log('\nWROTE');
