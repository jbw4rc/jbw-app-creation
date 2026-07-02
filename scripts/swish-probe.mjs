// Throwaway discovery probe for SalarySwish structure (runs in CI).
// 1) fetch homepage, list internal links + summarize its tables
// 2) auto-follow the first likely team-page link and dump that page's tables
// Writes findings to swish-probe-output.txt (committed by the workflow) so the
// results can be pulled directly, no Actions-log access required.
import { writeFileSync } from 'fs';

let LOG = '';
const _log = console.log;
console.log = (...a) => {
  const line = a.join(' ');
  LOG += line + '\n';
  _log(line);
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  return { status: res.status, ct: res.headers.get('content-type') || '', body };
}

function links(html, base) {
  const set = new Set();
  const re = /href="([^"#]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    let h = m[1];
    if (h.startsWith('//') || h.startsWith('http')) {
      if (!h.includes('salaryswish.com')) continue;
    } else if (h.startsWith('/')) {
      h = base + h;
    } else continue;
    set.add(h.replace(/\/$/, ''));
  }
  return [...set];
}

function summarizeTables(html, label) {
  const live = html.replace(/<!--/g, '').replace(/-->/g, '');
  const tables = live.match(/<table[\s\S]*?<\/table>/gi) || [];
  console.log(`  ${label}: ${tables.length} <table> elements`);
  tables.slice(0, 8).forEach((t, i) => {
    const idm = t.match(/id="([^"]+)"/);
    const clsm = t.match(/class="([^"]+)"/);
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const headerRow = rows.find((r) => /<th/i.test(r)) || rows[0] || '';
    const headers = (headerRow.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [])
      .map((c) => strip(c))
      .filter(Boolean)
      .slice(0, 14);
    const firstData = rows.find((r) => /<td/i.test(r) && !/<th/i.test(r));
    const dataCells = firstData
      ? (firstData.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map((c) => strip(c)).slice(0, 14)
      : [];
    // any data-stat attrs?
    const dataStats = [...new Set((t.match(/data-stat="([^"]+)"/g) || []).map((x) => x.slice(11, -1)))].slice(0, 20);
    console.log(`    table[${i}] id=${idm?.[1] || '-'} class=${(clsm?.[1] || '-').slice(0, 40)} rows=${rows.length}`);
    console.log(`      headers: ${headers.join(' | ')}`);
    if (dataCells.length) console.log(`      row0:    ${dataCells.join(' | ')}`);
    if (dataStats.length) console.log(`      data-stat: ${dataStats.join(', ')}`);
  });
}

const BASE = 'https://salaryswish.com';
console.log('▶ Homepage');
const home = await get(BASE + '/');
console.log(`  status ${home.status} · ${home.body.length.toLocaleString()} bytes`);
const allLinks = links(home.body, BASE);
console.log(`  internal links: ${allLinks.length}`);
console.log('  ALL internal links:');
allLinks.forEach((l) => console.log('    ' + l));
summarizeTables(home.body, 'homepage tables');

// Extract hrefs specifically inside the league table (the team links live there).
const tblM = home.body.match(/<table[^>]*id="sw_homepage__table"[\s\S]*?<\/table>/i);
const teamLinks = tblM ? links(tblM[0], BASE) : [];
console.log(`\n  team links inside sw_homepage__table: ${teamLinks.length}`);
teamLinks.slice(0, 8).forEach((l) => console.log('    ' + l));

const candidate =
  teamLinks.find((l) => /nugget|denver/i.test(l)) || teamLinks[0] ||
  allLinks.find((l) => /denver|nuggets/i.test(l));
console.log(`\n▶ Following candidate team page: ${candidate}`);
if (candidate) {
  const tp = await get(candidate);
  console.log(`  status ${tp.status} · ${tp.body.length.toLocaleString()} bytes`);
  console.log(`  title: ${(tp.body.match(/<title>([^<]*)<\/title>/) || [])[1] || '?'}`);
  summarizeTables(tp.body, 'team-page tables');
  writeFileSync('swish-team-sample.html', tp.body.slice(0, 8000));
}

console.log('\nProbe complete.');
writeFileSync('swish-probe-output.txt', LOG);

