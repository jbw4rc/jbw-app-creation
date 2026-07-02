// Pull all 30 teams' rosters + trade exceptions from SalarySwish and write
// src/data/seededRosters.ts, teamMeta.ts, and seededTradeExceptions.ts.
// Runs in CI (the dev sandbox can't reach the web). No spreadsheets required.
import { writeFileSync } from 'fs';

let LOG = '';
const _log = console.log;
console.log = (...a) => { const s = a.join(' '); LOG += s + '\n'; _log(s); };

const BASE = 'https://salaryswish.com';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Eastern/Western split by abbreviation (SalarySwish doesn't label conference).
const EAST = new Set(['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS']);
// Sections whose contracts count toward the cap figure we track.
const COUNT_SECTION = /active|inactive|dead/i;

const strip = (s) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function get(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

const dollars = (s) => {
  const d = String(s || '').replace(/[^\d]/g, '');
  return d ? parseInt(d, 10) : 0;
};

// --- Discover the 30 teams from the homepage league table --------------------
function parseTeams(homeHtml) {
  const tblM = homeHtml.match(/<table[^>]*id="sw_homepage__table"[\s\S]*?<\/table>/i);
  if (!tblM) throw new Error('homepage league table not found');
  const rows = tblM[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const teams = [];
  for (const r of rows) {
    const slugM = r.match(/\/teams\/([a-z0-9-]+)/i);
    if (!slugM) continue;
    const firstCell = (r.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/i) || [])[1] || '';
    const text = strip(firstCell);
    const abbrM = text.match(/([A-Z]{2,4})\s*$/);
    if (!abbrM) continue;
    const abbr = abbrM[1];
    const name = text.replace(/\s*[A-Z]{2,4}\s*$/, '').trim();
    if (teams.some((t) => t.abbr === abbr)) continue;
    teams.push({ slug: slugM[1], abbr, name });
  }
  return teams;
}

// --- Parse one roster <table> into player records ----------------------------
function parseRosterTable(tableHtml) {
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (!rows.length) return { section: '', players: [], stated: 0 };
  // Header row: section label + season labels.
  const headerCells = rows[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
  const headerTexts = headerCells.map((c) => strip(c));
  const section = headerTexts[0] || '';
  const statedM = section.match(/\$([\d,]+)/);
  const stated = statedM ? dollars(statedM[1]) : 0;
  // Season columns are the header cells that look like 2026-27.
  const seasonCols = [];
  headerTexts.forEach((t, i) => {
    const m = t.match(/\b(20\d{2})\b/);
    if (m) seasonCols.push({ i, season: parseInt(m[1], 10) });
  });

  const players = [];
  let checksum2026 = 0;
  const idx2026 = (seasonCols.find((s) => s.season === 2026) || {}).i;
  for (let ri = 1; ri < rows.length; ri++) {
    const cells = rows[ri].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    if (!cells.length) continue;
    const nameCell = cells[0] || '';
    const slugM = nameCell.match(/\/players\/([a-z0-9-]+)/i);
    const name = strip(nameCell);
    // Section subtotal / "TOTAL" row: capture as a checksum, don't treat as a player.
    if (/^total\b/i.test(name)) {
      const c = idx2026 != null ? cells[idx2026] || '' : '';
      const m = c.match(/\$?([\d,]{5,})/);
      if (m) checksum2026 = dollars(m[1]);
      continue;
    }
    // Skip blanks and all-caps labels (real names carry lowercase letters).
    if (!name || /\$/.test(name) || !/[a-z]/.test(name)) continue;
    const posCell = cells[4] || '';
    const ageCell = cells[3] || '';
    const termsCell = cells[5] || '';
    const contract = [];
    for (const { i, season } of seasonCols) {
      const cell = cells[i] || '';
      if (/class="[^"]*\bufa\b/i.test(cell)) { contract.push({ season, salary: 0, option: 'ufa' }); continue; }
      if (/class="[^"]*\brfa\b/i.test(cell)) { contract.push({ season, salary: 0, option: 'rfa' }); continue; }
      const capM = cell.match(/class="cap_hit[^"]*"[^>]*>\s*\$?([\d,]+)/i);
      if (!capM) continue;
      const salary = dollars(capM[1]);
      if (salary <= 0) continue;
      let option = 'guaranteed';
      if (/team_option_tag[^>]*>\s*P\b/i.test(cell)) option = 'player';
      else if (/team_option_tag[^>]*>\s*T\b/i.test(cell)) option = 'team';
      else if (/non[_-]?guaranteed/i.test(cell)) option = 'nonGuaranteed';
      contract.push({ season, salary, option });
    }
    // Drop trailing FA-only entries (no salary) so they don't clutter, but keep
    // an FA marker for the current season if present.
    if (!contract.some((c) => c.salary > 0)) continue;
    const age = parseInt(strip(ageCell).replace(/[^\d]/g, ''), 10);
    players.push({
      id: slugM ? `ss-${slugM[1]}` : `ss-${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      name: normalizeName(name),
      position: strip(posCell) || '—',
      age: Number.isFinite(age) ? age : 0,
      contract,
      signedUsing: strip(termsCell) || undefined,
    });
  }
  return { section, players, stated, checksum2026 };
}

function normalizeName(name) {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : name.trim();
}

// --- Parse the trade-exception table -----------------------------------------
function parseTpeTable(html) {
  const m = html.match(/<table[^>]*id="sw_table__tradeExptn_tm"[\s\S]*?<\/table>/i);
  if (!m) return [];
  const rows = m[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = (rows[i].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map((c) => strip(c));
    if (cells.length < 6 || /\$/.test(cells[0]) || !cells[0]) continue;
    out.push({
      player: cells[0],
      exception: dollars(cells[1]),
      used: dollars(cells[2]),
      remaining: dollars(cells[3]),
      start: cells[4],
      end: cells[5],
    });
  }
  return out;
}

// Date "Jul 8, 2025" → ISO.
function toISO(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

// --- Run ---------------------------------------------------------------------
try {
  await run();
} catch (e) {
  console.log(`\n!! BUILD FAILED: ${e.stack || e.message}`);
  writeFileSync('build-salaries-report.txt', LOG);
  process.exit(1);
}

async function run() {
console.log('Pulling rosters from SalarySwish…');
const home = await get(BASE + '/');
console.log(`homepage bytes: ${home.length.toLocaleString()}`);
const teams = parseTeams(home);
console.log(`Discovered ${teams.length} teams: ${teams.map((t) => `${t.abbr}:${t.slug}`).join(' ')}`);
if (teams.length !== 30) throw new Error(`expected 30 teams, got ${teams.length}`);

const rosters = {};
const tpeLines = ['Team\tPlayer\tException\tUsed\tRemaining\tStart Date\tEnd Date'];
let tpeCount = 0;
const report = [];

// Fetch with light concurrency.
const queue = [...teams];
async function worker() {
  while (queue.length) {
    const t = queue.shift();
    try {
      const html = await get(`${BASE}/teams/${t.slug}`);
      const rosterTables = html.match(/<table[^>]*class="[^"]*sw_teamProfileRosterSection__table[^"]*"[\s\S]*?<\/table>/gi) || [];
      const players = [];
      let checksum = 0;
      for (const tbl of rosterTables) {
        const { section, players: ps, checksum2026 } = parseRosterTable(tbl);
        if (!COUNT_SECTION.test(section)) continue;
        if (/active/i.test(section)) checksum = checksum2026;
        players.push(...ps);
      }
      rosters[t.abbr] = players;
      const sum2026 = players.reduce((s, p) => s + (p.contract.find((c) => c.season === 2026)?.salary ?? 0), 0);
      const ok = checksum > 0 && Math.abs(sum2026 - checksum) < 2000;
      report.push({ abbr: t.abbr, n: players.length, sum2026, checksum, ok });

      for (const e of parseTpeTable(html)) {
        tpeLines.push([t.abbr, e.player, e.exception, e.used, e.remaining, toISO(e.start), toISO(e.end)].join('\t'));
        tpeCount++;
      }
    } catch (e) {
      console.error(`  ${t.abbr} FAILED: ${e.message}`);
      report.push({ abbr: t.abbr, n: 0, sum2026: 0, statedActive: 0 });
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

console.log('\nTeam   players  sum2026-27        checksum        match');
let mismatches = 0;
for (const r of report.sort((a, b) => a.abbr.localeCompare(b.abbr))) {
  if (!r.ok) mismatches++;
  console.log(
    `  ${r.abbr.padEnd(4)} ${String(r.n).padStart(3)}   $${r.sum2026.toLocaleString().padStart(14)}   $${r.checksum.toLocaleString().padStart(14)}   ${r.ok ? 'OK' : '*** MISMATCH'}`
  );
}
const totalPlayers = Object.values(rosters).reduce((s, ps) => s + ps.length, 0);
console.log(`\nTotal players: ${totalPlayers} · TPEs: ${tpeCount} · checksum mismatches: ${mismatches}/30`);
if (totalPlayers < 300) throw new Error(`only ${totalPlayers} players — layout likely changed`);
if (mismatches > 5) throw new Error(`${mismatches} teams failed the Active-total checksum — parse likely off`);

// Team meta (name from homepage, conference by abbr).
const meta = teams
  .map((t) => ({ abbreviation: t.abbr, name: t.name, conference: EAST.has(t.abbr) ? 'East' : 'West' }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(
  'src/data/seededRosters.ts',
  `// AUTO-GENERATED from SalarySwish — do not edit by hand.\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `import type { Player } from '../types';\n\n` +
    `export const SEEDED_ROSTERS: Record<string, Player[]> = ${JSON.stringify(rosters, null, 2)};\n`
);
writeFileSync(
  'src/data/teamMeta.ts',
  `// AUTO-GENERATED team directory (abbr, name, conference).\n` +
    `export interface TeamMeta { abbreviation: string; name: string; conference: 'East' | 'West'; }\n\n` +
    `export const TEAM_META: TeamMeta[] = ${JSON.stringify(meta, null, 2)};\n`
);
writeFileSync(
  'src/data/seededTradeExceptions.ts',
  `// AUTO-GENERATED trade-exception (TPE) table from SalarySwish.\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `export const SEEDED_TRADE_EXCEPTIONS = ${JSON.stringify(tpeLines.join('\n'))};\n`
);
console.log('\nWrote seededRosters.ts, teamMeta.ts, seededTradeExceptions.ts');
writeFileSync('build-salaries-report.txt', LOG);
}
