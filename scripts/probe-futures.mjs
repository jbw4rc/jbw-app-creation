// THROWAWAY PROBE. Dumps raw Tankathon draft-board row HTML so we can write a
// precise parser. Delete after use.
import { writeFileSync } from 'fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const res = await fetch('https://www.tankathon.com/', {
  headers: { 'User-Agent': UA, Accept: '*/*' },
});
const html = await res.text();
const out = [];
const log = (...a) => out.push(a.join(' '));

log(`status ${res.status} bytes ${html.length}`);

// Raw slice starting at the draft board so we can see pick-row structure.
const boardIdx = html.indexOf('draft-board-table-container');
log('\n===== RAW @ draft-board-table-container (4500 chars) =====');
log(html.slice(boardIdx, boardIdx + 4500));

// Also dump the first standings <table> data rows (has Record / Win% / Chances).
const tblIdx = html.indexOf('<table');
log('\n\n===== RAW @ first <table> (3500 chars) =====');
log(html.slice(tblIdx, tblIdx + 3500));

writeFileSync('probe-futures-out.txt', out.join('\n'));
log('\nWROTE');
