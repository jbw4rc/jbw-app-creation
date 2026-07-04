// Build an empirical NBA aging curve from DARKO career histories.
//
// Method (the "delta method", Tango/Lichtman, standard in the field):
//   For every player we pull their full game-by-game DPM history from
//   darko.app/player/{id}/__data.json, reduce it to one end-of-season DPM per
//   played season, then take deltas between CONSECUTIVE seasons. Each delta is
//   the observed change in true-talent DPM over one year of aging, bucketed by
//   the player's (rounded) age in the earlier season. Averaging deltas per age
//   and chaining them yields a cumulative curve of expected DPM by age.
//
// Units are DARKO DPM (points per 100 poss), the same metric the app uses, so
// no cross-metric mapping is needed. Deltas are minutes-weighted so noisy
// low-sample seasons count less.
//
// CAVEAT (documented in output): the sample is current DARKO players' careers,
// so it is survivor-biased toward players good enough to still be tracked.
// That inflates apparent late-career retention somewhat. This is v1 (a single
// talent-blind curve); a talent-bucketed version is a planned follow-up.
import { writeFileSync } from 'fs';

const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Get the current player universe (nba_id + name) from the homepage blob.
console.log('Fetching DARKO player list…');
const home = await (await fetch('https://darko.app/', { headers: H })).text();
const scripts = [...home.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const big = scripts.filter((x) => /player_name:/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
const ids = [];
const seen = new Set();
for (const m of big.matchAll(/nba_id:(\d+),date:"[^"]*",season:\d+/g)) {
  const id = m[1];
  if (!seen.has(id)) { seen.add(id); ids.push(id); }
}
// Fallback: any nba_id followed later by a player_name.
if (ids.length < 100) {
  for (const m of big.matchAll(/nba_id:(\d+)/g)) {
    const id = m[1];
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
}
console.log(`  ${ids.length} players`);
if (ids.length < 100) throw new Error('player list too small — layout changed');

// SvelteKit __data.json dedup decoder: root maps field->index into flat array.
function decodeHistory(json) {
  let j;
  try { j = JSON.parse(json); } catch { return null; }
  const node = (j.nodes || []).find((n) => n && n.type === 'data' && Array.isArray(n.data));
  if (!node) return null;
  const D = node.data;
  const root = D[0];
  if (!root || typeof root !== 'object') return null;
  const rowsIdx = root.historyRows;
  if (rowsIdx == null || !Array.isArray(D[rowsIdx])) return null;
  const rows = D[rowsIdx];
  const out = [];
  for (const ri of rows) {
    const o = D[ri];
    if (!o || typeof o !== 'object') continue;
    const g = (k) => D[o[k]];
    out.push({
      season: g('season'),
      dpm: g('dpm'),
      age: g('age'),
      poss: g('poss'),
      futureGame: g('future_game'),
      cgn: g('career_game_num'),
      secs: g('seconds_played'),
    });
  }
  return out;
}

// 2) For each player, reduce history to one row per PLAYED season: the last
// game (max career_game_num) with real minutes = DARKO's end-of-season talent
// estimate. Also accumulate that season's total seconds for weighting.
function seasonRows(hist) {
  const bySeason = new Map();
  for (const r of hist) {
    if (r.futureGame) continue;          // skip projected future games
    if (!(r.poss > 0)) continue;         // must have played
    if (typeof r.dpm !== 'number' || typeof r.age !== 'number') continue;
    const s = r.season;
    const cur = bySeason.get(s);
    if (!cur) bySeason.set(s, { season: s, dpm: r.dpm, age: r.age, cgn: r.cgn ?? 0, secs: r.secs || 0 });
    else {
      cur.secs += r.secs || 0;
      if ((r.cgn ?? 0) >= cur.cgn) { cur.dpm = r.dpm; cur.age = r.age; cur.cgn = r.cgn ?? cur.cgn; }
    }
  }
  return [...bySeason.values()].sort((a, b) => a.season - b.season);
}

// 3) Delta method. Accumulate minutes-weighted DPM deltas by rounded age.
const MIN_SECS = 500 * 60; // ~500 minutes in a season to count it
const bucket = new Map(); // age -> {wsum, wdsum, n}
let players = 0, playerSeasons = 0, deltas = 0;

let done = 0;
for (const id of ids) {
  let body;
  try {
    const r = await fetch(`https://darko.app/player/${id}/__data.json`, { headers: H });
    if (!r.ok) { await sleep(60); continue; }
    body = await r.text();
  } catch { await sleep(120); continue; }
  const hist = decodeHistory(body);
  if (hist) {
    const rows = seasonRows(hist).filter((r) => r.secs >= MIN_SECS);
    if (rows.length) { players++; playerSeasons += rows.length; }
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = rows[i], b = rows[i + 1];
      if (b.season - a.season !== 1) continue;       // consecutive seasons only
      const age = Math.round(a.age);
      if (age < 18 || age > 40) continue;
      const w = Math.min(a.secs, b.secs);            // weight by the smaller sample
      const d = b.dpm - a.dpm;
      const e = bucket.get(age) || { wsum: 0, wdsum: 0, n: 0 };
      e.wsum += w; e.wdsum += w * d; e.n += 1;
      bucket.set(age, e);
      deltas++;
    }
  }
  if (++done % 50 === 0) console.log(`  ${done}/${ids.length} players fetched…`);
  await sleep(40); // be polite
}
console.log(`  players ${players}, player-seasons ${playerSeasons}, deltas ${deltas}`);

// 4) Per-age mean delta, then smooth (3-age moving average) for stability.
const AGES = [];
for (let a = 19; a <= 38; a++) AGES.push(a);
const rawDelta = new Map();
for (const a of AGES) {
  const e = bucket.get(a);
  rawDelta.set(a, e && e.wsum > 0 ? e.wdsum / e.wsum : null);
}
const smooth = new Map();
for (const a of AGES) {
  let s = 0, w = 0;
  for (const k of [a - 1, a, a + 1]) {
    const v = rawDelta.get(k);
    if (v != null) { const weight = k === a ? 2 : 1; s += weight * v; w += weight; }
  }
  smooth.set(a, w > 0 ? s / w : 0);
}

// 5) Chain deltas into a cumulative DPM curve; normalize so the peak age = 0.
// cum[a] = expected DPM at age a relative to cum at age 19 baseline.
const cum = new Map();
let acc = 0;
cum.set(19, 0);
for (let a = 20; a <= 38; a++) { acc += smooth.get(a - 1) ?? 0; cum.set(a, acc); }
let peakAge = 19, peakVal = -Infinity;
for (const a of AGES) { const v = cum.get(a); if (v > peakVal) { peakVal = v; peakAge = a; } }
// Re-center so peak = 0 (curve is <= 0 everywhere; how much DPM you gain
// reaching peak, or lose past it).
const curve = AGES.map((a) => ({
  age: a,
  delta: Math.round((smooth.get(a) ?? 0) * 1000) / 1000,       // yr-over-yr change entering next age
  rel: Math.round((cum.get(a) - peakVal) * 1000) / 1000,       // DPM vs peak (<=0)
  n: bucket.get(a)?.n ?? 0,
}));

console.log('\n  age  yoyΔ    vsPeak   n');
for (const p of curve) console.log(`  ${p.age}  ${p.delta.toFixed(2).padStart(6)}  ${p.rel.toFixed(2).padStart(6)}  ${p.n}`);
console.log(`  peak age ${peakAge}`);

writeFileSync(
  'src/data/agingCurve.ts',
  `// AUTO-GENERATED empirical NBA aging curve (delta method on DARKO DPM history).\n` +
    `// Regenerate: node scripts/build-aging-curve.mjs\n` +
    `// Units: DARKO DPM (pts/100 poss). 'rel' = expected DPM at that age vs peak (<=0).\n` +
    `// 'delta' = year-over-year DPM change entering the next age.\n` +
    `// CAVEAT: survivor-biased sample (current DARKO players' careers). v1 = single\n` +
    `// talent-blind curve; talent-bucketing is a planned follow-up.\n` +
    `export interface AgingPoint { age: number; delta: number; rel: number; n: number; }\n` +
    `export const AGING_PEAK_AGE = ${peakAge};\n` +
    `export const AGING_META = ${JSON.stringify({ players, playerSeasons, deltas, source: 'darko.app career histories', survivorBias: true })};\n` +
    `export const AGING_CURVE: AgingPoint[] = ${JSON.stringify(curve)};\n`
);
console.log('\nWrote src/data/agingCurve.ts');
