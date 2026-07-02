// Throwaway: find how SalarySwish lists two-way players on a team page.
import { writeFileSync } from 'fs';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'text/html,*/*' };
let LOG = '';
const log = (s) => { LOG += s + '\n'; console.log(s); };
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

for (const slug of ['magic', 'kings']) {
  const html = await (await fetch(`https://salaryswish.com/teams/${slug}`, { headers: HEADERS })).text();
  const tables = html.match(/<table[^>]*class="[^"]*sw_teamProfileRosterSection__table[^"]*"[\s\S]*?<\/table>/gi) || [];
  log(`\n===== ${slug}: ${tables.length} roster sections =====`);
  tables.forEach((t) => {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const head = strip((rows[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/i) || [])[1] || '');
    log(`  · section: "${head}" (${rows.length - 1} rows)`);
    if (/two.?way/i.test(head)) {
      log('    >> TWO-WAY SECTION FOUND. First data row raw:');
      const dataRow = rows.find((r, i) => i > 0 && /<td/.test(r));
      if (dataRow) log('    ' + dataRow.replace(/>\s+</g, '><').slice(0, 1100));
    }
  });
  // Also search the whole page for a known two-way player row.
  for (const nm of ['Castleton', 'Flagler']) {
    const idx = html.indexOf(nm);
    if (idx > -1) { log(`\n  window around "${nm}":\n    ${html.slice(idx - 250, idx + 500).replace(/>\s+</g, '><')}`); break; }
  }
}
writeFileSync('tw-debug.txt', LOG);
console.log('done');
