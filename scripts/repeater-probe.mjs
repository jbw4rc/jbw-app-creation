// Throwaway: dump the SalarySwish luxury-tax page (repeater checkboxes + rate logic).
import { writeFileSync } from 'fs';
const URL = 'https://www.salaryswish.com/luxury-tax/2027';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
let LOG = '';
const log = (s) => { LOG += s + '\n'; console.log(s); };
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const res = await fetch(URL, { headers: HEADERS });
const html = (await res.text()).replace(/<!--/g, '').replace(/-->/g, '');
log(`status ${res.status} · ${html.length.toLocaleString()} bytes`);
const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
log(`tables: ${tables.length}`);
tables.forEach((t, i) => {
  const id = (t.match(/id="([^"]+)"/) || [])[1] || '-';
  const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const header = (rows[0]?.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || []).map(strip);
  log(`\n== table[${i}] id=${id} rows=${rows.length}`);
  log(`   headers: ${header.join(' | ')}`);
  rows.slice(1, 4).forEach((r, ri) => {
    log(`   --- row ${ri} strip --- ${strip(r)}`);
    log(`   --- row ${ri} raw   --- ${r.replace(/>\s+</g, '><').slice(0, 700)}`);
  });
  // Any checkbox / checked markers?
  const checks = t.match(/type="checkbox"[^>]*>|checked|repeater/gi) || [];
  log(`   checkbox/repeater tokens in table: ${[...new Set(checks)].slice(0, 6).join(' , ')}`);
});
const paras = (html.match(/<p[\s\S]*?<\/p>/gi) || []).map(strip).filter((p) => /repeat|tax rate|bracket|1\.5|incremental/i.test(p));
log('\n-- rate/logic prose --');
paras.slice(0, 8).forEach((p) => log('   • ' + p.slice(0, 400)));
writeFileSync('repeater-debug.txt', LOG);
console.log('done');
