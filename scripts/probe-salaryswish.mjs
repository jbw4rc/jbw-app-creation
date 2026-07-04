// PROBE: why did the SalarySwish checksum parse break? Dump NYK + DET active
// table structure and player rows. Writes probe-ss-out.txt. Delete after use.
import { writeFileSync } from 'fs';
const BASE = 'https://salaryswish.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};
const out = [];
const log = (...a) => { out.push(a.join(' ')); };
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();
const dollars = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : 0; };
const get = async (u) => (await fetch(u, { headers: HEADERS })).text();

for (const [abbr, slug] of [['NYK', 'knicks'], ['DET', 'pistons']]) {
  log(`\n===== ${abbr} (${slug}) =====`);
  const html = await get(`${BASE}/teams/${slug}`);
  log(`page ${html.length}b · has 'drummond': ${/drummond/i.test(html)}`);
  const tables = html.match(/<table[^>]*class="[^"]*sw_teamProfileRosterSection__table[^"]*"[\s\S]*?<\/table>/gi) || [];
  log(`roster tables: ${tables.length}`);
  for (const tbl of tables) {
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (!rows.length) continue;
    const headerCells = rows[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
    const headerTexts = headerCells.map(strip);
    const section = headerTexts[0] || '';
    log(`\n  SECTION "${section}"  cols=${headerTexts.length}`);
    log(`  headers: ${headerTexts.map((h, i) => `[${i}]${h}`).join(' ')}`);
    if (!/active/i.test(section)) continue;
    // Find the 2026 column index.
    const seasonCols = [];
    headerTexts.forEach((t, i) => { const m = t.match(/\b(20\d{2})\b/); if (m) seasonCols.push({ i, season: +m[1] }); });
    log(`  seasonCols: ${seasonCols.map((s) => `${s.season}@${s.i}`).join(' ')}`);
    const idx2026 = (seasonCols.find((s) => s.season === 2026) || {}).i;
    log(`  idx2026 = ${idx2026}`);
    // Dump each row: name + cells around idx2026; flag total rows.
    for (let ri = 1; ri < rows.length; ri++) {
      const cells = rows[ri].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      if (!cells.length) continue;
      const nm = strip(cells[0] || '');
      const c2026 = idx2026 != null ? strip(cells[idx2026] || '') : '';
      const capM = (cells[idx2026] || '').match(/class="cap_hit[^"]*"[^>]*>\s*\$?([\d,]+)/i);
      if (/^total\b/i.test(nm) || !/[a-z]/.test(nm)) {
        // total / label row — show its raw 2026 cell + all big numbers in the row
        const rowNums = [...rows[ri].matchAll(/([\d,]{6,})/g)].map((x) => dollars(x[1]));
        log(`  [TOTAL?] "${nm}" cell2026="${c2026}" bigNumsInRow=${rowNums.join(',')}`);
      } else {
        log(`  ${nm.padEnd(22)} 2026="${c2026}" capHit=${capM ? dollars(capM[1]) : 'none'}`);
      }
    }
  }
}
writeFileSync('probe-ss-out.txt', out.join('\n') + '\n');
console.log('wrote probe-ss-out.txt');
