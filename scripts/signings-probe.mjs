// Throwaway: dump the SalarySwish signings page structure so we can parse it.
import { writeFileSync } from 'fs';
const URL = 'https://www.salaryswish.com/signings/all/all/all/all/1-6/0-100000000/06012026-07022026';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
let LOG = '';
const log = (s) => { LOG += s + '\n'; console.log(s); };
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const res = await fetch(URL, { headers: HEADERS });
const html = await res.text();
log(`status ${res.status} · ${html.length.toLocaleString()} bytes`);
const tables = html.replace(/<!--/g, '').replace(/-->/g, '').match(/<table[\s\S]*?<\/table>/gi) || [];
log(`tables: ${tables.length}`);
tables.forEach((t, i) => {
  const id = (t.match(/id="([^"]+)"/) || [])[1] || '-';
  const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const header = (rows[0]?.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || []).map(strip);
  log(`\n== table[${i}] id=${id} rows=${rows.length}`);
  log(`   headers: ${header.join(' | ')}`);
  rows.slice(1, 4).forEach((r, ri) => {
    log(`   --- row ${ri} raw ---\n   ${r.replace(/>\s+</g, '><').slice(0, 900)}`);
  });
});
// --- Bi-annual exception page ------------------------------------------------
log('\n\n=========== BI-ANNUAL EXCEPTION PAGE ===========');
const bae = await fetch('https://www.salaryswish.com/bi-annual-exception', { headers: HEADERS });
const bhtml = await bae.text();
log(`status ${bae.status} · ${bhtml.length.toLocaleString()} bytes`);
const btables = bhtml.replace(/<!--/g, '').replace(/-->/g, '').match(/<table[\s\S]*?<\/table>/gi) || [];
log(`tables: ${btables.length}`);
btables.forEach((t, i) => {
  const id = (t.match(/id="([^"]+)"/) || [])[1] || '-';
  const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const header = (rows[0]?.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || []).map(strip);
  log(`\n== BAE table[${i}] id=${id} rows=${rows.length}`);
  log(`   headers: ${header.join(' | ')}`);
  rows.slice(1, 5).forEach((r, ri) => log(`   row${ri}: ${strip(r)}`));
});
// Grab any explanatory "logic" prose (paragraphs mentioning bi-annual rules).
const paras = (bhtml.match(/<p[\s\S]*?<\/p>/gi) || []).map(strip).filter((p) => p.length > 40);
log('\n-- prose (first 6 paragraphs) --');
paras.slice(0, 6).forEach((p) => log('   • ' + p.slice(0, 400)));

writeFileSync('signings-debug.txt', LOG);
console.log('done');
