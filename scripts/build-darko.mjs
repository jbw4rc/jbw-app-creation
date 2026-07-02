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
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

const num = (s) => { const n = parseFloat(s); return Number.isFinite(n) ? n : null; };
const f2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

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
  const games = num((p.match(/career_game_num:(\d+)/) || [])[1]) ?? 0;
  if (!id || !name || dpm == null) continue;
  // Keep one row per player (the most-experienced / current snapshot line).
  const prev = byId.get(id);
  if (!prev || games >= prev.games) byId.set(id, { id: +id, name, dpm, odpm, ddpm, rank, games });
}

const players = [...byId.values()].sort((a, b) => b.dpm - a.dpm);
console.log(`  parsed ${players.length} players`);
if (players.length < 300) throw new Error(`only ${players.length} DARKO players — layout likely changed`);
console.log('  top 5 by DPM: ' + players.slice(0, 5).map((p) => `${p.name} ${p.dpm.toFixed(1)}`).join(', '));

// Map keyed by normalized name for joining to our roster/stats.
const out = {};
for (const p of players) {
  const key = norm(p.name);
  if (!(key in out)) out[key] = { name: p.name, dpm: f2(p.dpm), odpm: f2(p.odpm), ddpm: f2(p.ddpm), rank: p.rank };
}

writeFileSync(
  'src/data/seededDarko.ts',
  `// AUTO-GENERATED DARKO Daily Plus-Minus (DPM) from darko.app.\n` +
    `// Regenerate: node scripts/build-darko.mjs\n` +
    `export interface DarkoInfo { name: string; dpm: number; odpm: number | null; ddpm: number | null; rank: number | null; }\n\n` +
    `// Keyed by normalized player name (lowercase, no accents/punctuation).\n` +
    `export const SEEDED_DARKO: Record<string, DarkoInfo> = ${JSON.stringify(out, null, 0)};\n`
);
console.log(`\nWrote src/data/seededDarko.ts (${Object.keys(out).length} players).`);
