// Throwaway: dump the SalarySwish draft-pick table markup for a few teams so we
// can write the parser. Commits draft-debug.txt. Removed once mapped.
import { writeFileSync } from 'fs';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};
let LOG = '';
const log = (s) => { LOG += s + '\n'; console.log(s); };

async function draftTable(slug) {
  const res = await fetch(`https://salaryswish.com/teams/${slug}`, { headers: HEADERS });
  const html = await res.text();
  const m = html.match(/<table[^>]*id="sw_teamProfile__draftTable"[\s\S]*?<\/table>/i);
  return m ? m[0] : '(not found)';
}

for (const slug of ['nuggets', 'thunder', 'jazz', 'nets']) {
  log(`\n================= ${slug} =================`);
  const t = await draftTable(slug);
  // Compact whitespace to keep it readable.
  log(t.replace(/>\s+</g, '><').slice(0, 6000));
}
writeFileSync('draft-debug.txt', LOG);
console.log('\ndone');
