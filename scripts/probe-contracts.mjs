// THROWAWAY PROBE v2. Loads Spotrac's free-agent market-value page with a REAL
// headless Chromium (Playwright) to get past the "Update Your Browser" UA gate,
// and dumps the table structure. Writes probe-contracts-out.txt.
import { writeFileSync } from 'fs';
import { chromium } from 'playwright';

const out = [];
const log = (...a) => out.push(a.join(' '));
const strip = (s) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
});

async function probe(label, url) {
  log(`\n\n######## ${label}\n${url}`);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    log(`status ${resp?.status()} · final ${page.url()}`);
    const html = await page.content();
    log(`bytes ${html.length}`);
    if (/Update Your Browser|Just a moment/i.test(html)) {
      log('  STILL BLOCKED');
      return;
    }
    for (const w of ['market value', 'projected', 'AAV', 'per year', 'yrs', 'free agent']) {
      const i = html.toLowerCase().indexOf(w.toLowerCase());
      if (i >= 0) log(`  ~"${w}" @${i}: ${strip(html.slice(i - 30, i + 100))}`);
    }
    const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
    log(`  tables: ${tables.length}`);
    tables.slice(0, 3).forEach((tbl, i) => {
      const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
      log(`   [${i}] rows=${rows.length}`);
      log(`       hdr:  ${strip(rows[0] || '').slice(0, 200)}`);
      log(`       row1: ${strip(rows[1] || '').slice(0, 200)}`);
      log(`       row2: ${strip(rows[2] || '').slice(0, 200)}`);
    });
  } catch (e) {
    log(`  ERROR ${e.message}`);
  }
}

await probe('Spotrac NBA free agents', 'https://www.spotrac.com/nba/free-agents/');
await probe('Spotrac NBA market value (rankings)', 'https://www.spotrac.com/nba/rankings/market-value/');

await browser.close();
writeFileSync('probe-contracts-out.txt', out.join('\n'));
log('\nWROTE');
