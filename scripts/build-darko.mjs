// Pull DARKO Daily Plus-Minus (DPM) current-talent projections from darko.app
// (the data is embedded in the page) and write src/data/seededDarko.ts.
// Runs in CI. DPM = total, O-DPM = offense, D-DPM = defense.
import { writeFileSync } from 'fs';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,*/*',
};

// Normalize a player name for joining across sources (strip accents/punctuation).
const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const f2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
// Dollars → millions, 1 decimal (e.g. 94052625 → 94.1).
const fM = (n) => (n == null ? null : Math.round(n / 1e5) / 10);

console.log('Pulling DARKO DPM from darko.app…');
const html = await (await fetch('https://darko.app/', { headers: HEADERS })).text();
console.log(`  page ${html.length.toLocaleString()} bytes`);

// The DPM records live in the largest inline <script> that mentions dpm.
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const big = scripts.filter((x) => /player_name:/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
if (!big) throw new Error('DARKO data script not found — page layout changed');

// Each record starts at "nba_id:" and ends before the next one.
const parts = big.split(/nba_id:/).slice(1);
const byId = new Map();
for (const p of parts) {
  const id = (p.match(/^(\d+)/) || [])[1];
  const name = (p.match(/player_name:"([^"]+)"/) || [])[1];
  const dpm = num((p.match(/(?:^|[,{])dpm:(-?[\d.]+)/) || [])[1]);
  const odpm = num((p.match(/(?:^|[,{])o_dpm:(-?[\d.]+)/) || [])[1]);
  const ddpm = num((p.match(/(?:^|[,{])d_dpm:(-?[\d.]+)/) || [])[1]);
  const rank = num((p.match(/_rank:(\d+)/) || [])[1]);
  const value = num((p.match(/sal_market_fixed:(-?[\d.]+)/) || [])[1]);
  const surplus = num((p.match(/surplus_value:(-?[\d.]+)/) || [])[1]);
  const salary = num((p.match(/actual_salary:(-?[\d.]+)/) || [])[1]);
  const games = num((p.match(/career_game_num:(\d+)/) || [])[1]) ?? 0;
  const age = num((p.match(/(?:^|[,{])age:(-?[\d.]+)/) || [])[1]);
  const pos = (p.match(/(?:^|[,{])position:"([^"]*)"/) || [])[1] || null;
  const posNum = num((p.match(/(?:^|[,{])position_num:(-?[\d.]+)/) || [])[1]);
  // x_position: DARKO's projected 5-way position ARCHETYPE ("pg_pos" … "c_pos").
  // Cleaner than the coarse `position` string (which mislabels e.g. shooting
  // guards as "F") — this is the position we group off of.
  const xpos = (p.match(/(?:^|[,{])x_position:"([^"]*)"/) || [])[1] || null;
  // x_minutes: DARKO's projected minutes per game — used to weight team talent by
  // real playing time (a team only has 240 player-minutes to allocate a game).
  const min = num((p.match(/(?:^|[,{])x_minutes:(-?[\d.]+)/) || [])[1]);
  // Projected per-100-possession box line — drives the derived player archetype
  // (playmaking, shot volume, 3-point rate, rim protection, rebounding).
  const g100 = (k) => num((p.match(new RegExp(`(?:^|[,{])x_${k}_100:(-?[\\d.]+)`)) || [])[1]);
  // Keep offensive and defensive rebounds SEPARATE (they're different skills);
  // reb stays as the sum for backward compatibility.
  const orb = g100('orb'), drb = g100('drb');
  const box = {
    pts: g100('pts'), ast: g100('ast'), stl: g100('stl'), blk: g100('blk'),
    tov: g100('tov'), fga: g100('fga'), fg3a: g100('fg3a'), fta: g100('fta'),
    orb, drb, reb: (orb ?? 0) + (drb ?? 0),
    fg3pct: num((p.match(/(?:^|[,{])x_fg3_pct:(-?[\d.]+)/) || [])[1]),
  };
  // s1..s15: DARKO's player-specific value-retention curve by future season
  // (s1 = this season = 1.0). Used as the aging curve in trade value.
  const decline = [];
  for (let i = 1; i <= 15; i++) {
    decline.push(num((p.match(new RegExp(`(?:^|[,{])s${i}:(-?[\\d.]+)`)) || [])[1]));
  }
  if (!id || !name || dpm == null) continue;
  // Keep one row per player (the most-experienced / current snapshot line).
  const prev = byId.get(id);
  if (!prev || games >= prev.games) byId.set(id, { id: +id, name, dpm, odpm, ddpm, salary, value, surplus, rank, games, age, pos, xpos, posNum, min, box, decline });
}

const players = [...byId.values()].sort((a, b) => b.dpm - a.dpm);
console.log(`  parsed ${players.length} players`);
if (players.length < 300) throw new Error(`only ${players.length} DARKO players — layout likely changed`);
console.log('  top 5 by DPM: ' + players.slice(0, 5).map((p) => `${p.name} ${p.dpm.toFixed(1)}`).join(', '));

// Map keyed by normalized name for joining to our roster/stats.
const out = {};
for (const p of players) {
  const key = norm(p.name);
  const r3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000);
  if (!(key in out))
    out[key] = {
      name: p.name,
      dpm: f2(p.dpm),
      odpm: f2(p.odpm),
      ddpm: f2(p.ddpm),
      salary: fM(p.salary),
      value: fM(p.value),
      surplus: fM(p.surplus),
      rank: p.rank,
      age: p.age == null ? null : Math.round(p.age * 10) / 10,
      pos: p.pos,
      xpos: p.xpos,
      posNum: p.posNum == null ? null : Math.round(p.posNum * 100) / 100,
      min: p.min == null ? null : Math.round(p.min * 10) / 10,
      box: p.box.pts == null ? null : {
        pts: r3(p.box.pts), ast: r3(p.box.ast), reb: r3(p.box.reb),
        orb: r3(p.box.orb), drb: r3(p.box.drb), stl: r3(p.box.stl),
        blk: r3(p.box.blk), tov: r3(p.box.tov), fga: r3(p.box.fga), fg3a: r3(p.box.fg3a),
        fta: r3(p.box.fta), fg3pct: r3(p.box.fg3pct),
      },
      decline: p.decline.map(r3),
    };
}

writeFileSync(
  'src/data/seededDarko.ts',
  `// AUTO-GENERATED DARKO Daily Plus-Minus (DPM) from darko.app.\n` +
    `// Regenerate: node scripts/build-darko.mjs\n` +
    `export interface DarkoBox { pts: number | null; ast: number | null; reb: number | null; orb: number | null; drb: number | null; stl: number | null; blk: number | null; tov: number | null; fga: number | null; fg3a: number | null; fta: number | null; fg3pct: number | null; }\n` +
    `export interface DarkoInfo { name: string; dpm: number; odpm: number | null; ddpm: number | null; salary: number | null; value: number | null; surplus: number | null; rank: number | null; age: number | null; pos: string | null; xpos: string | null; posNum: number | null; min: number | null; box: DarkoBox | null; decline: (number | null)[]; }\n\n` +
    `// Keyed by normalized player name (lowercase, no accents/punctuation).\n` +
    `export const SEEDED_DARKO: Record<string, DarkoInfo> = ${JSON.stringify(out, null, 0)};\n`
);
console.log(`\nWrote src/data/seededDarko.ts (${Object.keys(out).length} players).`);
