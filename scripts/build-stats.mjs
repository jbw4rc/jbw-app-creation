// Pull a season's player advanced + per-game stats from Basketball-Reference
// and write src/data/seededStats.ts. Runs in CI (the dev sandbox can't reach
// the web). Usage: node scripts/build-stats.mjs [seasonEndYear]
import { writeFileSync } from 'fs';

const SEASON_END = parseInt(process.argv[2] || '2026', 10); // 2026 => 2025-26
const SEASON = `${SEASON_END - 1}-${String(SEASON_END).slice(-2)}`;
const SEASON_LABEL = `${SEASON_END - 1}-${String(SEASON_END).slice(-2)}`;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// BBRef → our abbreviations.
const TEAM_FIX = { BRK: 'BKN', CHO: 'CHA', PHO: 'PHX' };
const fixTeam = (t) => TEAM_FIX[t] || t;

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

const stripTags = (s) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .trim();

// Extract a table's <tbody> rows as an array of { id, cells:{data-stat: value} }.
function parseTable(html, tableIdPart) {
  // De-comment so BBRef's comment-wrapped tables become live.
  const live = html.replace(/<!--/g, '').replace(/-->/g, '');
  // Find a <table ... id="...tableIdPart..."> ... </table>
  const re = new RegExp(`<table[^>]*id="([^"]*${tableIdPart}[^"]*)"[\\s\\S]*?</table>`, 'i');
  const m = live.match(re);
  if (!m) return { id: null, rows: [] };
  const table = m[0];
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let tr;
  while ((tr = trRe.exec(table))) {
    const inner = tr[1];
    if (/class="[^"]*thead/.test(tr[0])) continue; // repeated header rows
    const cells = {};
    let id = null;
    const cellRe = /<(td|th)[^>]*data-stat="([^"]+)"[^>]*>([\s\S]*?)<\/(td|th)>/g;
    let c;
    let cellCount = 0;
    while ((c = cellRe.exec(inner))) {
      const stat = c[2];
      const raw = c[3];
      cells[stat] = stripTags(raw);
      cellCount++;
      const csv = /data-append-csv="([^"]+)"/.exec(c[0]);
      if (csv) id = csv[1];
      if (!id) {
        const href = /\/players\/[a-z]\/([a-z0-9]+)\.html/i.exec(raw);
        if (href) id = href[1];
      }
    }
    if (cellCount === 0) continue;
    rows.push({ id, cells });
  }
  return { id: m[1], rows };
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const pct = (v) => num(v); // BBRef gives .567 style already 0–1
const pick = (cells, keys) => {
  for (const k of keys) if (cells[k] != null && cells[k] !== '') return cells[k];
  return '';
};

const advUrl = `https://www.basketball-reference.com/leagues/NBA_${SEASON_END}_advanced.html`;
const pgUrl = `https://www.basketball-reference.com/leagues/NBA_${SEASON_END}_per_game.html`;

console.log(`Building stats for ${SEASON} from Basketball-Reference…`);
const [advHtml, pgHtml] = await Promise.all([get(advUrl), get(pgUrl)]);
console.log(`  advanced page: ${advHtml.length.toLocaleString()} bytes`);
console.log(`  per_game page: ${pgHtml.length.toLocaleString()} bytes`);

const adv = parseTable(advHtml, 'advanced');
const pg = parseTable(pgHtml, 'per_game');
console.log(`  advanced table id="${adv.id}" rows=${adv.rows.length}`);
console.log(`  per_game table id="${pg.id}" rows=${pg.rows.length}`);
if (adv.rows[0]) console.log(`  advanced data-stat keys: ${Object.keys(adv.rows[0].cells).join(', ')}`);
if (pg.rows[0]) console.log(`  per_game data-stat keys: ${Object.keys(pg.rows[0].cells).join(', ')}`);

// Index per-game rows by player id (prefer combined/TOT line for traded players).
const combined = new Set(['TOT', '2TM', '3TM', '4TM']);
function indexRows(rows) {
  const byId = new Map();
  for (const r of rows) {
    if (!r.id) continue;
    const team = pick(r.cells, ['team_name_abbr', 'team_id', 'team']);
    const existing = byId.get(r.id);
    if (!existing) byId.set(r.id, r);
    else if (combined.has(team)) byId.set(r.id, r); // prefer combined line
  }
  return byId;
}
const pgById = indexRows(pg.rows);

const players = [];
for (const r of adv.rows) {
  if (!r.id) continue;
  const advTeam = pick(r.cells, ['team_name_abbr', 'team_id', 'team']);
  // For traded players, the advanced table also has a combined row; keep it.
  const a = r.cells;
  const p = pgById.get(r.id)?.cells ?? {};
  const name = pick(a, ['name_display', 'player']);
  if (!name) continue;
  const rec = {
    id: r.id,
    name,
    team: fixTeam(advTeam || pick(p, ['team_name_abbr', 'team_id']) || '—'),
    pos: pick(a, ['pos']) || pick(p, ['pos']),
    age: num(pick(a, ['age'])),
    g: num(pick(p, ['games', 'g']) || pick(a, ['games', 'g'])),
    gs: num(pick(p, ['games_started', 'gs'])),
    mpg: num(pick(p, ['mp_per_g'])),
    pts: num(pick(p, ['pts_per_g'])),
    trb: num(pick(p, ['trb_per_g'])),
    ast: num(pick(p, ['ast_per_g'])),
    stl: num(pick(p, ['stl_per_g'])),
    blk: num(pick(p, ['blk_per_g'])),
    tov: num(pick(p, ['tov_per_g'])),
    fgPct: pct(pick(p, ['fg_pct'])),
    fg3Pct: pct(pick(p, ['fg3_pct'])),
    ftPct: pct(pick(p, ['ft_pct'])),
    per: num(pick(a, ['per'])),
    tsPct: pct(pick(a, ['ts_pct'])),
    usgPct: pct(pick(a, ['usg_pct'])),
    astPct: pct(pick(a, ['ast_pct'])),
    trbPct: pct(pick(a, ['trb_pct'])),
    stlPct: pct(pick(a, ['stl_pct'])),
    blkPct: pct(pick(a, ['blk_pct'])),
    tovPct: pct(pick(a, ['tov_pct'])),
    ows: num(pick(a, ['ows'])),
    dws: num(pick(a, ['dws'])),
    ws: num(pick(a, ['ws'])),
    ws48: num(pick(a, ['ws_per_48'])),
    obpm: num(pick(a, ['obpm'])),
    dbpm: num(pick(a, ['dbpm'])),
    bpm: num(pick(a, ['bpm'])),
    vorp: num(pick(a, ['vorp'])),
  };
  // Percentages on BBRef advanced are 0–1 already; usg/ast/etc are 0–100 → normalize to 0–1.
  for (const k of ['usgPct', 'astPct', 'trbPct', 'stlPct', 'blkPct', 'tovPct']) {
    if (rec[k] > 1.5) rec[k] = rec[k] / 100;
  }
  players.push(rec);
}

console.log(`  merged ${players.length} players`);
const withPg = players.filter((p) => p.pts > 0 || p.g > 0).length;
console.log(`  players with per-game data: ${withPg}`);
if (players[0]) console.log(`  sample: ${JSON.stringify(players[0])}`);
const jokic = players.find((p) => /jokic/i.test(p.name));
if (jokic) console.log(`  Jokic check: ${JSON.stringify(jokic)}`);

if (players.length < 100) {
  console.error(`!! Only ${players.length} players parsed — layout likely changed. Not writing seed.`);
  process.exit(1);
}

const bundle = {
  season: SEASON,
  seasonLabel: SEASON_LABEL,
  asOf: new Date().toISOString(),
  source: 'Basketball-Reference',
  players: players.sort((x, y) => y.vorp - x.vorp),
};

writeFileSync(
  'src/data/seededStats.ts',
  `// AUTO-GENERATED from Basketball-Reference — do not edit by hand.\n` +
    `// Regenerate: node scripts/build-stats.mjs <seasonEndYear>\n` +
    `import type { StatsBundle } from './statsTypes';\n\n` +
    `export const SEEDED_STATS: StatsBundle = ${JSON.stringify(bundle, null, 0)};\n`
);
console.log(`\nWrote src/data/seededStats.ts (${players.length} players, season ${SEASON}).`);
