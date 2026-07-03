// THROWAWAY PROBE. Digs into Tankathon's page structure to find the projected
// draft order / standings for the upcoming draft, and dumps the shape to
// probe-futures-out.txt so the dev sandbox (no web) can read it after a pull.
// Delete after use.
import { writeFileSync } from 'fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const out = [];
const log = (...a) => {
  out.push(a.join(' '));
  console.log(...a);
};

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
  const text = await res.text();
  return { status: res.status, ct: res.headers.get('content-type') || '', text };
}

const URLS = [
  'https://www.tankathon.com/',
  'https://www.tankathon.com/nba',
  'https://www.tankathon.com/draft_order',
  'https://www.tankathon.com/nba/draft_order',
  'https://www.tankathon.com/full_standings',
  'https://www.tankathon.com/nba/full_standings',
  'https://www.tankathon.com/picks',
];

for (const url of URLS) {
  log(`\n\n########## ${url}`);
  try {
    const { status, ct, text } = await get(url);
    log(`status ${status} ${ct} bytes ${text.length}`);
    if (status !== 200) continue;

    // Embedded state blobs used by React/Next apps.
    for (const marker of ['__NEXT_DATA__', 'window.__INITIAL', '__PRELOADED', 'application/json']) {
      const idx = text.indexOf(marker);
      log(`  marker ${marker}: ${idx >= 0 ? 'FOUND @' + idx : 'no'}`);
    }

    // Does it look like projected/record data is inline? Sample surrounding text
    // around signal words.
    for (const word of ['projected', 'wins', 'record', 'draft-order', 'pick_number', 'proj_record', 'standing']) {
      const i = text.toLowerCase().indexOf(word);
      if (i >= 0) {
        log(`  ~"${word}" @${i}: ${text.slice(i - 40, i + 120).replace(/\s+/g, ' ').trim()}`);
      }
    }

    // If a __NEXT_DATA__ script is present, dump a big slice of it (that's the
    // full page data as JSON).
    const nd = text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nd) {
      log(`  __NEXT_DATA__ length ${nd[1].length}`);
      log(`  __NEXT_DATA__ head: ${nd[1].slice(0, 3000)}`);
    }

    // Otherwise: extract any team-row-ish table cells to learn the DOM shape.
    // Tankathon rows tend to carry team abbreviations and records.
    const rowSample = text.match(/<tr[\s\S]{0,600}?<\/tr>/g);
    if (rowSample) {
      log(`  <tr> rows: ${rowSample.length}; first 2 stripped:`);
      for (const r of rowSample.slice(0, 2)) {
        log('   ' + r.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ').replace(/\|+/g, ' | ').trim().slice(0, 300));
      }
    }
    // class names hint at the component structure.
    const classes = [...new Set((text.match(/class="([^"]{0,40})"/g) || []).map((c) => c))]
      .filter((c) => /team|pick|record|standing|draft|proj|row/i.test(c))
      .slice(0, 25);
    log(`  relevant classes: ${classes.join('  ')}`);
  } catch (e) {
    log(`  ERROR ${e.message}`);
  }
}

writeFileSync('probe-futures-out.txt', out.join('\n'));
log('\n\nWROTE probe-futures-out.txt');
