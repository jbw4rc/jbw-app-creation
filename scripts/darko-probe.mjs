// Throwaway: discover a machine-readable DARKO DPM source reachable from CI.
import { writeFileSync } from 'fs';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: '*/*',
};
let LOG = '';
const log = (s) => { LOG += s + '\n'; console.log(s); };

async function probe(url) {
  log(`\n▶ ${url}`);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    clearTimeout(t);
    const ct = res.headers.get('content-type') || '';
    const body = await res.text();
    log(`  status ${res.status} · ${ct} · ${body.length.toLocaleString()} bytes`);
    if (/json/.test(ct)) {
      try { const j = JSON.parse(body); log(`  JSON keys: ${Object.keys(j).slice(0, 20).join(', ')}`); } catch { log('  (json parse failed)'); }
    } else {
      const next = body.includes('__NEXT_DATA__');
      const apis = [...new Set((body.match(/["'`](https?:\/\/[^"'`]*?(api|sheets|\.json|\.csv|dpm|darko)[^"'`]*)["'`]/gi) || []).map((m) => m.slice(1, -1)))].slice(0, 15);
      const nextData = body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      log(`  html · __NEXT_DATA__=${next}`);
      if (apis.length) log('  candidate data urls:\n    ' + apis.join('\n    '));
      if (nextData) {
        try {
          const nd = JSON.parse(nextData[1]);
          log(`  __NEXT_DATA__ buildId=${nd.buildId} pageProps keys=${Object.keys(nd?.props?.pageProps || {}).join(', ')}`);
        } catch { log('  __NEXT_DATA__ present, unparsed'); }
      }
      // Look for a Google Sheets id
      const sheet = body.match(/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
      if (sheet) log(`  google sheet id: ${sheet[1]}`);
      log(`  first 200: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
    }
  } catch (e) {
    log(`  ERROR ${e.name}: ${e.message}`);
  }
}

await probe('https://darko.app/');
await probe('https://darko.app/data/darko_dpm.json');
await probe('https://apanalytics.shinyapps.io/DARKO/');
// The DARKO app's next build often exposes a static data file; try common paths.
await probe('https://darko.app/api/players');
await probe('https://darko.app/board');

writeFileSync('darko-debug.txt', LOG);
console.log('\ndone');
