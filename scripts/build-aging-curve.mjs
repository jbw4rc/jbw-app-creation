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
// Per-age weighted-regression accumulators for  Δdpm = α(age) + β(age)·dpm.
// α = how much a typical player changes at that age; β = how much extra a
// higher-talent (higher current DPM) player gains — the "talent slope".
const acc = new Map(); // age -> {w, wx, wxx, wy, wxy, n}
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
      const x = a.dpm;                                // starting talent
      const y = b.dpm - a.dpm;                        // one-year change
      const e = acc.get(age) || { w: 0, wx: 0, wxx: 0, wy: 0, wxy: 0, n: 0 };
      e.w += w; e.wx += w * x; e.wxx += w * x * x; e.wy += w * y; e.wxy += w * x * y; e.n += 1;
      acc.set(age, e);
      deltas++;
    }
  }
  if (++done % 50 === 0) console.log(`  ${done}/${ids.length} players fetched…`);
  await sleep(40); // be polite
}
console.log(`  players ${players}, player-seasons ${playerSeasons}, deltas ${deltas}`);

// 4) Per-age weighted least squares for (α, β). Shrink β toward 0 when the age
// cell is thin (β·n/(n+N0)) and clamp so the forward recursion stays stable.
const AGES = [];
for (let a = 19; a <= 38; a++) AGES.push(a);
const N0 = 40;                 // shrinkage strength (samples worth of "no slope")
const BETA_CLAMP = [-0.6, 0.4];
function fitAge(a) {
  const e = acc.get(a);
  if (!e || e.w <= 0 || e.n < 3) return null;
  const mx = e.wx / e.w;
  const sxx = e.wxx - e.w * mx * mx;             // weighted variance of x
  const sxy = e.wxy - e.wx * (e.wy / e.w);       // weighted covariance
  let beta = sxx > 1e-6 ? sxy / sxx : 0;
  beta *= e.n / (e.n + N0);                       // shrink toward 0 on small n
  beta = Math.max(BETA_CLAMP[0], Math.min(BETA_CLAMP[1], beta));
  const alpha = (e.wy - beta * e.wx) / e.w;       // intercept given (shrunk) slope
  return { alpha, beta, n: e.n };
}
const rawFit = new Map(AGES.map((a) => [a, fitAge(a)]));

// Smooth α and β across adjacent ages (weighted 3-age window) for stability.
function smoothField(pick) {
  const out = new Map();
  for (const a of AGES) {
    let s = 0, w = 0;
    for (const k of [a - 1, a, a + 1]) {
      const f = rawFit.get(k);
      if (f) { const wt = (k === a ? 2 : 1) * f.n; s += wt * pick(f); w += wt; }
    }
    out.set(a, w > 0 ? s / w : 0);
  }
  return out;
}
const alphaBy = smoothField((f) => f.alpha);
const betaBy = smoothField((f) => f.beta);

const coeffs = AGES.map((a) => ({
  age: a,
  alpha: Math.round(alphaBy.get(a) * 1000) / 1000,
  beta: Math.round(betaBy.get(a) * 1000) / 1000,
  n: rawFit.get(a)?.n ?? 0,
}));

// 5) Forward recursion: project a starting (age, dpm) along the curve.
function project(startAge, startDpm, years) {
  let d = startDpm;
  for (let a = Math.round(startAge); a < Math.round(startAge) + years; a++) {
    const c = coeffs.find((x) => x.age === Math.max(19, Math.min(38, a)));
    d += (c?.alpha ?? 0) + (c?.beta ?? 0) * d;
    d = Math.max(-4, Math.min(12, d));
  }
  return d;
}

// Reference single curve (talent-blind, dpm=0 trajectory) for legends/peak.
const zero = AGES.map((a) => ({ age: a, dpm: project(19, 0, a - 19) }));
let peakAge = 19, peakVal = -Infinity;
for (const p of zero) if (p.dpm > peakVal) { peakVal = p.dpm; peakAge = p.age; }
const curve = zero.map((p) => ({
  age: p.age,
  rel: Math.round((p.dpm - peakVal) * 1000) / 1000,
  n: rawFit.get(p.age)?.n ?? 0,
}));

// Diagnostics: α, β by age + three tier trajectories from age 20.
console.log('\n  age   alpha   beta    n');
for (const c of coeffs) console.log(`  ${c.age}  ${c.alpha.toFixed(3).padStart(6)}  ${c.beta.toFixed(3).padStart(6)}  ${c.n}`);
console.log(`  reference peak age ${peakAge}`);
console.log('\n  tier trajectories from age 20 (proj DPM at +1..+6 yrs):');
for (const [name, d0] of [['low  (-1.5)', -1.5], ['mid  (+0.5)', 0.5], ['high (+3.0)', 3.0]]) {
  const path = [1, 2, 3, 4, 5, 6].map((k) => project(20, d0, k).toFixed(2));
  console.log(`  ${name}: ${path.join('  ')}`);
}

writeFileSync(
  'src/data/agingCurve.ts',
  `// AUTO-GENERATED talent-aware NBA aging curve (DARKO DPM career histories).\n` +
    `// Regenerate: node scripts/build-aging-curve.mjs\n` +
    `//\n` +
    `// Model: for each age we fit  Δdpm = alpha(age) + beta(age)*dpm  by weighted\n` +
    `// least squares over consecutive-season pairs. alpha = a typical player's\n` +
    `// yearly change at that age; beta = the talent slope (extra change per point\n` +
    `// of current DPM). Project a player forward by iterating the recursion with\n` +
    `// HIS OWN current DPM, so higher-talent young players develop more (and stars\n` +
    `// mean-revert) straight from the data — no hand-set tiers.\n` +
    `// CAVEAT: survivor-biased sample (current DARKO players' careers).\n` +
    `export interface AgingCoeff { age: number; alpha: number; beta: number; n: number; }\n` +
    `export interface AgingPoint { age: number; rel: number; n: number; }\n` +
    `export const AGING_PEAK_AGE = ${peakAge};\n` +
    `export const AGING_META = ${JSON.stringify({ players, playerSeasons, deltas, source: 'darko.app career histories', survivorBias: true, model: 'per-age WLS delta = alpha + beta*dpm' })};\n` +
    `export const AGING_COEFFS: AgingCoeff[] = ${JSON.stringify(coeffs)};\n` +
    `// Reference talent-blind trajectory (dpm=0), for legends only.\n` +
    `export const AGING_CURVE: AgingPoint[] = ${JSON.stringify(curve)};\n`
);
console.log('\nWrote src/data/agingCurve.ts');
