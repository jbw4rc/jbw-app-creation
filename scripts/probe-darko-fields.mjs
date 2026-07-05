// PROBE: inventory DARKO homepage record fields + sample the minutes/career
// fields across the playing-time spectrum. Writes probe-darko-fields-out.txt.
import { writeFileSync } from 'fs';
const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,*/*',
};
const out = [];
const log = (...a) => { out.push(a.join(' ')); };
const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };

const html = await (await fetch('https://darko.app/', { headers: H })).text();
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const big = scripts.filter((x) => /player_name:/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
const parts = big.split(/nba_id:/).slice(1);

// Full key inventory from the first record.
const first = parts[0];
const keys = [...new Set([...first.matchAll(/([a-z_0-9]{2,}):/gi)].map((m) => m[1]))];
log(`records: ${parts.length}`);
log(`KEYS (${keys.length}): ${keys.join(' ')}`);

const g = (p, k) => num((p.match(new RegExp(`(?:^|[,{])${k}:(-?[\\d.]+)`)) || [])[1]);
const gs = (p, k) => (p.match(new RegExp(`(?:^|[,{])${k}:"([^"]*)"`)) || [])[1];

const rows = parts.map((p) => ({
  name: gs(p, 'player_name'),
  dpm: g(p, 'dpm'),
  x_minutes: g(p, 'x_minutes'),
  tr_minutes: g(p, 'tr_minutes'),
  tr_starter: g(p, 'tr_starter'),
  poss: g(p, 'poss'),
  secs: g(p, 'seconds_played'),
  pyr: g(p, 'projected_years_remaining'),
  x_ret: g(p, 'x_retirement_age'),
  bayes: g(p, 'bayes_rapm_total'),
  box_dpm: g(p, 'box_dpm'),
  onoff: g(p, 'on_off_dpm'),
  x_pts: g(p, 'x_pts_100'),
  age: g(p, 'age'),
})).filter((r) => r.name);

// Sample across the minutes spectrum: sort by x_minutes.
const withMin = rows.filter((r) => r.x_minutes != null).sort((a, b) => b.x_minutes - a.x_minutes);
const pick = [0, 5, 50, 150, 300, withMin.length - 60, withMin.length - 20, withMin.length - 5]
  .filter((i) => i >= 0 && i < withMin.length);
log('\nname                 dpm   x_min tr_min tr_st poss  secs   yrsLeft xRet bayes boxDpm onoff xPts age');
for (const i of pick) {
  const r = withMin[i];
  const f = (v, w = 6) => (v == null ? '—' : String(v)).padStart(w);
  log(`${(r.name || '').slice(0, 20).padEnd(20)} ${f(r.dpm)} ${f(r.x_minutes)} ${f(r.tr_minutes)} ${f(r.tr_starter, 5)} ${f(r.poss)} ${f(r.secs)} ${f(r.pyr, 7)} ${f(r.x_ret)} ${f(r.bayes)} ${f(r.box_dpm)} ${f(r.onoff)} ${f(r.x_pts)} ${f(r.age)}`);
}

// Coverage: how many records have each interesting field populated?
const cov = (k) => rows.filter((r) => r[k] != null).length;
log('\ncoverage / ' + rows.length + ':');
for (const k of ['x_minutes', 'tr_minutes', 'tr_starter', 'poss', 'projected_years_remaining', 'x_retirement_age', 'bayes_rapm_total', 'box_dpm', 'on_off_dpm', 'x_pts_100'].map((k) => k.replace('projected_years_remaining', 'pyr').replace('x_retirement_age', 'x_ret').replace('bayes_rapm_total', 'bayes').replace('box_dpm', 'box_dpm').replace('on_off_dpm', 'onoff').replace('x_pts_100', 'x_pts'))) {
  log(`  ${k}: ${cov(k)}`);
}
writeFileSync('probe-darko-fields-out.txt', out.join('\n') + '\n');
console.log('wrote');
