// THROWAWAY PROBE. Dumps raw rows of the FA Cap Hold / RFAs / 1st Rd Picks
// sections on a SalarySwish team page so we can write the hold parser.
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
const get = async (u) => (await fetch(u, { headers: H })).text();

const home = await get(BASE + '/');
const slug = [...new Set([...home.matchAll(/\/teams\/([a-z0-9-]+)/gi)].map((m) => m[1]))][0];
const html = await get(`${BASE}/teams/${slug}`);
log(`team: ${slug}`);

const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
for (const tbl of tables) {
  const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const hdr = strip(rows[0] || '');
  if (!/^(FA Cap Hold|RFAs|UFAs|1st Rd Picks)/i.test(hdr)) continue;
  log(`\n\n===== SECTION: ${hdr.slice(0, 80)} =====`);
  // Dump the first 2 data rows raw (truncated) to see cell classes.
  for (const r of rows.slice(1, 3)) {
    log('--- stripped: ' + strip(r).slice(0, 200));
    log('--- raw: ' + r.replace(/\s+/g, ' ').slice(0, 1400));
  }
}
writeFileSync('probe-capholds-out.txt', out.join('\n'));
log('\nWROTE');
