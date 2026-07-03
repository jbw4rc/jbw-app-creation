// THROWAWAY PROBE. Inspects a SalarySwish team page for the cap-holds / free
// agent section: dumps table ids, headers, and a couple rows so we can write a
// parser. Writes probe-capholds-out.txt. Delete after use.
import { writeFileSync } from 'fs';

const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,*/*',
};
const out = [];
const log = (...a) => out.push(a.join(' '));
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function get(u) {
  const r = await fetch(u, { headers: H });
  return { status: r.status, t: await r.text() };
}

// A couple teams likely to carry FA cap holds this offseason.
for (const slug of ['denver-nuggets', 'los-angeles-lakers']) {
  const { status, t: html } = await get(`https://salaryswish.com/teams/${slug}`);
  log(`\n\n######## ${slug} -> ${status} (${html.length}b)`);

  // Signal words.
  for (const w of ['cap hold', 'caphold', 'hold', 'bird', 'free agent', 'renounce', 'incomplete', 'dead']) {
    const i = html.toLowerCase().indexOf(w);
    log(`  "${w}": ${i >= 0 ? 'yes @' + i : 'no'}`);
  }

  // All tables: id + header row.
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  log(`  tables: ${tables.length}`);
  tables.forEach((tbl, idx) => {
    const id = (tbl.match(/<table[^>]*id="([^"]+)"/i) || [])[1] || '(no id)';
    const cls = (tbl.match(/<table[^>]*class="([^"]+)"/i) || [])[1] || '';
    const firstRow = (tbl.match(/<tr[\s\S]*?<\/tr>/i) || [''])[0];
    log(`   [${idx}] id=${id} class="${cls}" hdr: ${strip(firstRow).slice(0, 160)}`);
  });

  // If a table mentions hold/bird, dump its first 3 data rows raw-ish.
  const capTbl = tables.find((tbl) => /hold|bird|free.?agent|renounce/i.test(tbl));
  if (capTbl) {
    log(`  --- cap-hold-ish table rows ---`);
    const trs = capTbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    trs.slice(0, 5).forEach((tr) => log('    ' + strip(tr).slice(0, 220)));
    log(`  --- raw first data row (900 chars) ---`);
    log('    ' + (trs[1] || '').slice(0, 900));
  }
}

writeFileSync('probe-capholds-out.txt', out.join('\n'));
log('\nWROTE');
