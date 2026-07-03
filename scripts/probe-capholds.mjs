// THROWAWAY PROBE. Discovers real team slugs from the SalarySwish homepage, then
// dumps a team page's table structure to find the cap-holds / free-agent section.
import { writeFileSync } from 'fs';

const BASE = 'https://salaryswish.com';
const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,*/*',
};
const out = [];
const log = (...a) => out.push(a.join(' '));
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const get = async (u) => {
  const r = await fetch(u, { headers: H });
  return { status: r.status, t: await r.text() };
};

const { t: home } = await get(BASE + '/');
const slugs = [...new Set([...home.matchAll(/\/teams\/([a-z0-9-]+)/gi)].map((m) => m[1]))];
log(`slugs found (${slugs.length}): ${slugs.slice(0, 8).join(', ')}`);

for (const slug of slugs.slice(0, 2)) {
  const { status, t: html } = await get(`${BASE}/teams/${slug}`);
  log(`\n\n######## ${slug} -> ${status} (${html.length}b)`);
  for (const w of ['cap hold', 'hold', 'bird', 'free agent', 'renounce', 'incomplete', 'dead', 'two-way']) {
    const i = html.toLowerCase().indexOf(w);
    log(`  "${w}": ${i >= 0 ? 'yes @' + i : 'no'}`);
  }
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  log(`  tables: ${tables.length}`);
  tables.forEach((tbl, idx) => {
    const id = (tbl.match(/<table[^>]*id="([^"]+)"/i) || [])[1] || '(no id)';
    const cls = (tbl.match(/<table[^>]*class="([^"]+)"/i) || [])[1] || '';
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    log(`   [${idx}] id=${id} class="${cls}" rows=${rows.length} hdr: ${strip(rows[0] || '').slice(0, 150)}`);
  });
  // Dump any table whose text mentions hold/bird/free agent.
  const cap = tables.find((tbl) => /hold|bird|free.?agent|renounce/i.test(strip(tbl)));
  if (cap) {
    const rows = cap.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    log(`  --- cap-ish table (${rows.length} rows), first 6 stripped ---`);
    rows.slice(0, 6).forEach((r) => log('    ' + strip(r).slice(0, 240)));
    log(`  --- raw data row (1000 chars) ---`);
    log('    ' + (rows[1] || rows[0] || '').replace(/\s+/g, ' ').slice(0, 1000));
  }
}
writeFileSync('probe-capholds-out.txt', out.join('\n'));
log('\nWROTE');
