// THROWAWAY PROBE. Inspects darko.app for MULTI-YEAR projection data: dumps a
// full player record's fields and looks for future-season DPM / value. Writes
// probe-darko-out.txt for the sandbox to read after a pull. Delete after use.
import { writeFileSync } from 'fs';

const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,*/*',
};
const out = [];
const log = (...a) => out.push(a.join(' '));

async function get(u) {
  try {
    const r = await fetch(u, { headers: H });
    const t = await r.text();
    return { status: r.status, t };
  } catch (e) {
    return { status: 0, t: `ERR ${e.message}` };
  }
}

// 1) Homepage: dump a full record's field names + one full record.
const { t: html } = await get('https://darko.app/');
log(`homepage ${html.length} bytes`);
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const big = scripts.filter((x) => /player_name:/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
log(`data script ${big.length} bytes`);
const parts = big.split(/nba_id:/).slice(1);
log(`records: ${parts.length}`);
if (parts.length) {
  // All distinct field keys seen across the first 400 records.
  const keys = new Set();
  for (const p of parts.slice(0, 400)) {
    for (const m of p.matchAll(/([a-z_][a-z0-9_]*):/gi)) keys.add(m[1]);
  }
  log(`\n=== distinct field keys (first 400 recs) ===`);
  log([...keys].sort().join('  '));
  // Future-season signal words.
  log(`\n=== season/projection markers in data script ===`);
  for (const w of ['season', 'proj', 'forecast', 'future', 'pred', '2027', '2028', 'year']) {
    const i = big.indexOf(w);
    log(`  "${w}": ${i >= 0 ? 'yes @' + i : 'no'}`);
  }
  log(`\n=== FULL first record (2500 chars) ===`);
  log('nba_id:' + parts[0].slice(0, 2500));
}

// 2) Candidate projection pages/endpoints.
for (const u of [
  'https://darko.app/projections',
  'https://darko.app/projection',
  'https://darko.app/season-projections',
  'https://darko.app/api/players',
]) {
  const { status, t } = await get(u);
  log(`\n### ${u} -> ${status} (${t.length}b)`);
  if (status === 200) {
    for (const w of ['dpm', 'season', 'proj', 'sal_market', 'value', '2027']) {
      const i = t.indexOf(w);
      if (i >= 0) log(`  "${w}" @${i}: ${t.slice(i, i + 80).replace(/\s+/g, ' ')}`);
    }
  }
}

writeFileSync('probe-darko-out.txt', out.join('\n'));
log('\nWROTE');
