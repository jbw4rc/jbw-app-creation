// PROBE: is DARKO's offseason feed updating for transactions, or frozen at
// end-of-season? Report distinct record dates + team_name/minutes for known
// offseason movers. Writes probe-fresh-out.txt.
import { writeFileSync } from 'fs';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'text/html,*/*' };
const out = [];
const log = (...a) => out.push(a.join(' '));
const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const gs = (p, k) => (p.match(new RegExp(`(?:^|[,{])${k}:"([^"]*)"`)) || [])[1];
const gn = (p, k) => num((p.match(new RegExp(`(?:^|[,{])${k}:(-?[\\d.]+)`)) || [])[1]);

const html = await (await fetch('https://darko.app/', { headers: H })).text();
const big = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((x) => /player_name:/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
const parts = big.split(/nba_id:/).slice(1);
log(`fetched ${html.length}b · ${parts.length} records · now=${new Date().toISOString()}`);

// Distinct record dates (the last game each estimate reflects).
const dates = {};
for (const p of parts) { const d = gs(p, 'date'); if (d) dates[d] = (dates[d] || 0) + 1; }
log('\ndistinct dates (date -> #players):');
Object.entries(dates).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8).forEach(([d, n]) => log(`  ${d}: ${n}`));

// Known/likely offseason movers + a couple stars — DARKO team_name vs minutes.
const names = ['Andre Drummond', 'Nikola Jokic', 'LeBron James', 'Chris Paul', 'Kevin Durant', 'James Harden', 'Klay Thompson'];
log('\nname                 darko team_name          x_min  dpm   date');
for (const nm of names) {
  const p = parts.find((x) => (x.match(/player_name:"([^"]+)"/) || [])[1]?.includes(nm));
  if (!p) { log(`${nm}: (not found)`); continue; }
  log(`${nm.padEnd(20)} ${String(gs(p, 'team_name')).padEnd(24)} ${String(gn(p, 'x_minutes')).padStart(5)}  ${String(gn(p, 'dpm')).padStart(5)}  ${gs(p, 'date')}`);
}
writeFileSync('probe-fresh-out.txt', out.join('\n') + '\n');
console.log('wrote');
