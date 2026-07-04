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
      // The total row's 2026 cell leads with the 2026 grand total, then repeats
      // later-season totals (e.g. "$213,088,180 $214,018,007 …"). Take the FIRST
      // figure — the 2026 total — not the max (a later season can be larger). A
      // section may have several total rows; keep the largest first-figure.
      const c = idx2026 != null ? cells[idx2026] || '' : '';
      const first = (c.match(/([\d,]{6,})/) || [])[1];
      if (first) checksum2026 = Math.max(checksum2026, dollars(first));
      continue;
    }
    // Skip blanks and all-caps labels (real names carry lowercase letters).
    if (!name || /\$/.test(name) || !/[a-z]/.test(name)) continue;
    const posCell = cells[4] || '';
    const ageCell = cells[3] || '';
    const termsCell = cells[5] || '';
    // Two-way players sit in various sections; SalarySwish tags them in Terms.
    const isTwoWay = /two.?way/i.test(strip(termsCell));
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
    // Drop salary-less rows (FAs, empty picks), but keep two-way players (their
    // cap hit is $0 yet they belong to the roster).
    if (!isTwoWay && !contract.some((c) => c.salary > 0)) continue;
    const age = parseInt(strip(ageCell).replace(/[^\d]/g, ''), 10);
    players.push({
      id: slugM ? `ss-${slugM[1]}` : `ss-${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      name: normalizeName(name),
      position: strip(posCell) || '—',
      age: Number.isFinite(age) ? age : 0,
      contract,
      signedUsing: strip(termsCell) || undefined,
      ...(isTwoWay ? { twoWay: true } : {}),
    });
  }
  return { section, players, stated, checksum2026 };
}

function normalizeName(name) {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : name.trim();
}

// --- Parse cap holds ---------------------------------------------------------
// SalarySwish lists a team's unsigned holds in three roster sections. The hold
// amount is the cap_hit in the current-season (2026-27) column; rows with no
// 2026-27 amount are future/renounced and excluded.
const HOLD_SECTIONS = [
  { re: /^FA Cap Hold\b/i, type: 'veteran' },
  { re: /^RFAs\b/i, type: 'rfa' },
  { re: /^1st Rd Picks\b/i, type: 'draftPick' },
];

function parseCapHolds(html) {
  const tables =
    html.match(/<table[^>]*class="[^"]*sw_teamProfileRosterSection__table[^"]*"[\s\S]*?<\/table>/gi) || [];
  const holds = [];
  for (const tbl of tables) {
    const rows = tbl.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (!rows.length) continue;
    const headerCells = (rows[0].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(strip);
    const match = HOLD_SECTIONS.find((s) => s.re.test(headerCells[0] || ''));
    if (!match) continue;
    const idx2026 = headerCells.findIndex((h) => /^2026-27/.test(h));
    if (idx2026 < 0) continue;
    for (let ri = 1; ri < rows.length; ri++) {
      const cells = rows[ri].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
      if (!cells.length) continue;
      const rawName = strip(cells[0] || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
      if (/^total\b/i.test(rawName) || !/[a-z]/.test(rawName)) continue;
      const m = (cells[idx2026] || '').match(/class="cap_hit[^"]*"[^>]*>\s*\$?([\d,]+)/i);
      if (!m) continue;
      const amount = dollars(m[1]);
      if (amount <= 0) continue;
      const status = strip(cells[1] || '');
      const age = parseInt(strip(cells[3] || '').replace(/[^\d]/g, ''), 10);
      holds.push({
        player: normalizeName(rawName),
        amount,
        type: match.type,
        ...(status ? { terms: status } : {}),
        ...(Number.isFinite(age) ? { age } : {}),
      });
    }
  }
  return holds;
}

// --- Parse the draft-pick table ----------------------------------------------
const NICK2ABBR = {
  Hawks: 'ATL', Celtics: 'BOS', Nets: 'BKN', Hornets: 'CHA', Bulls: 'CHI', Cavaliers: 'CLE',
  Mavericks: 'DAL', Nuggets: 'DEN', Pistons: 'DET', Warriors: 'GSW', Rockets: 'HOU', Pacers: 'IND',
  Clippers: 'LAC', Lakers: 'LAL', Grizzlies: 'MEM', Heat: 'MIA', Bucks: 'MIL', Timberwolves: 'MIN',
  Pelicans: 'NOP', Knicks: 'NYK', Thunder: 'OKC', Magic: 'ORL', '76ers': 'PHI', Suns: 'PHX',
  Blazers: 'POR', Kings: 'SAC', Spurs: 'SAS', Raptors: 'TOR', Jazz: 'UTA', Wizards: 'WAS',
};
const altToAbbr = (alt) => NICK2ABBR[alt.trim().split(/\s+/).pop()] || null;
const decode = (s) => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');

// Returns the picks a team CONTROLS (own + incoming), excluding picks it has
// traded away. Unresolved swaps ("in contention") are flagged encumbered.
function parseDraft(html) {
  const m = html.match(/<table[^>]*id="sw_teamProfile__draftTable"[\s\S]*?<\/table>/i);
  if (!m) return [];
  const rows = m[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  if (!rows.length) return [];
  const header = (rows[0].match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || []).map(strip);
  const years = header.map((h) => { const y = h.match(/\b(20\d{2})\b/); return y ? +y[1] : null; });
  const picks = [];
  for (let ri = 1; ri < rows.length; ri++) {
    const cells = rows[ri].match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    const roundLabel = strip(cells[0] || '');
    const round = /round\s*1/i.test(roundLabel) ? 1 : /round\s*2/i.test(roundLabel) ? 2 : null;
    if (!round) continue;
    for (let ci = 1; ci < cells.length; ci++) {
      const year = years[ci];
      if (!year) continue;
      const cell = cells[ci];
      for (const pm of cell.matchAll(/<div class="rel (d_pick[^"]*)">\s*<img\b[^>]*\balt="Logo of the ([^"]+)"[^>]*>/g)) {
        const cls = pm[1];
        if (/d_pick_traded/.test(cls)) continue; // traded away — not controlled
        const abbr = altToAbbr(pm[2]);
        if (!abbr) continue;
        const before = cell.slice(Math.max(0, pm.index - 200), pm.index);
        const after = cell.slice(pm.index, pm.index + 260);
        const titles = before.match(/title="([^"]*)"/g);
        const notes = titles ? decode(titles[titles.length - 1].slice(7, -1)) : undefined;
        const encumbered = /inContention/.test(after) || /class="condit"/.test(after) || /contention/i.test(notes || '');
        const pick = { year, round, originalTeam: abbr };
        if (encumbered) pick.encumbered = true;
        if (notes) pick.notes = notes;
        picks.push(pick);
      }
    }
  }
  return picks;
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

// --- Offseason signings (dedicated SalarySwish page) -------------------------
// The app's focal season is 2026-27; signings count from June 1, 2026 onward.
const SIGNINGS_FROM_YEAR = 2026;
function mmddyyyy(d) {
  return `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${d.getFullYear()}`;
}
async function fetchSignings() {
  const from = `0601${SIGNINGS_FROM_YEAR}`;
  const to = mmddyyyy(new Date());
  const url = `https://www.salaryswish.com/signings/all/all/all/all/1-6/0-100000000/${from}-${to}`;
  const html = await get(url);
  const m = html.match(/<table[^>]*id="signings"[\s\S]*?<\/table>/i);
  const lines = ['PLAYER\tTEAM\tMETHOD\tDATE'];
  if (!m) return { lines, count: 0, tracked: 0 };
  const rows = m[0].match(/<tr[\s\S]*?<\/tr>/gi) || [];
  let tracked = 0;
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].match(/<td[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 8) continue;
    const player = strip(cells[0]).replace(/unconfirmed information/i, '').trim();
    const team = (strip(cells[4]).match(/([A-Z]{2,4})\s*$/) || [])[1] || '';
    const date = strip(cells[5]);
    const method = strip(cells[7]);
    if (!player || !team) continue;
    lines.push([player, team, method, toISO(date)].join('\t'));
    if (/\bmle\b/i.test(method) || /bi.?annual|\bbae\b/i.test(method)) tracked++;
  }
  return { lines, count: lines.length - 1, tracked };
}

// --- Bi-annual exception availability (authoritative per-team table) ----------
// Captures what a June-1-onward signings scan can't: the biennial rule and
// mutual exclusivity with the Taxpayer/Room MLE.
async function fetchBae() {
  const html = (await get('https://www.salaryswish.com/bi-annual-exception')).replace(/<!--/g, '').replace(/-->/g, '');
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const table = tables.find((t) => /Space Calc/i.test(t)) || tables[0];
  const out = {};
  if (!table) return out;
  const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const header = (rows[0]?.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || []).map((c) => strip(c).toLowerCase());
  const col = (re) => header.findIndex((h) => re.test(h));
  const iCalc = col(/calc/); const iInit = col(/initial/); const iUsed = col(/used/); const iSpace = col(/space$/);
  for (let i = 1; i < rows.length; i++) {
    const cells = (rows[i].match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map((c) => strip(c));
    if (cells.length < 5) continue;
    const abbr = (cells[0].match(/([A-Z]{2,4})\s*$/) || [])[1];
    if (!abbr) continue;
    out[abbr] = {
      initial: dollars(cells[iInit] ?? ''),
      used: dollars(cells[iUsed] ?? ''),
      space: dollars(cells[iSpace] ?? ''),
      note: (iCalc >= 0 ? cells[iCalc] : '').replace(/\s+/g, ' ').trim(),
    };
  }
  return out;
}

// --- Luxury-tax schedule + repeater flags (authoritative) --------------------
function computeBill(over, isRep, width, standard, repeater) {
  const rates = isRep ? repeater : standard;
  let bill = 0;
  for (let i = 0; over - i * width > 0; i++) {
    const amt = Math.min(over - i * width, width);
    const rate = i < rates.length ? rates[i] : rates[rates.length - 1] + 0.5 * (i - (rates.length - 1));
    bill += amt * rate;
  }
  return Math.round(bill);
}
async function fetchTax() {
  const html = (await get('https://www.salaryswish.com/luxury-tax/2027')).replace(/<!--/g, '').replace(/-->/g, '');
  const table = (html.match(/<table[\s\S]*?<\/table>/gi) || []).find((t) => /Bracket/i.test(t));
  const rows = table ? table.match(/<tr[\s\S]*?<\/tr>/gi) || [] : [];
  const rateRow = (label) => {
    const r = rows.find((x) => new RegExp(label, 'i').test(strip(x)) && !/\/teams\//.test(x));
    return r ? [...strip(r).matchAll(/([\d.]+)x/g)].map((m) => parseFloat(m[1])) : [];
  };
  const rangeRow = rows.find((x) => /bracket range/i.test(strip(x)));
  const firstRange = rangeRow && strip(rangeRow).match(/0-([\d.]+)M/);
  const bracketWidth = firstRange ? Math.round(parseFloat(firstRange[1]) * 1e6) : 6_064_000;
  const standard = rateRow('standard rate');
  const repeater = rateRow('repeater rate');
  const repeaters = {};
  const validation = [];
  for (const r of rows) {
    if (!/\/teams\//.test(r)) continue;
    const cells = (r.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []).map((c) => strip(c));
    const abbr = (cells[0].match(/([A-Z]{2,4})\s*$/) || [])[1];
    if (!abbr) continue;
    const isRep = /✓|✔|check/i.test(cells[2] || '') || /checked/i.test(r);
    repeaters[abbr] = isRep;
    const scrapedBill = dollars(cells[1] || '');
    const over = dollars(cells[3] || '');
    if (over > 0) validation.push({ abbr, over, isRep, scrapedBill, myBill: computeBill(over, isRep, bracketWidth, standard, repeater) });
  }
  return { bracketWidth, standard, repeater, repeaters, validation };
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
const picks = {};
const capHolds = {};
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
        // Anchor to the start so "Active" matches but "Inactive" does not (an
        // Inactive/dead section total would otherwise clobber the real checksum).
        if (/^active\b/i.test(section)) checksum = checksum2026;
        const isCount = COUNT_SECTION.test(section);
        for (const p of ps) {
          // Cap-counting sections contribute all players; other sections
          // (Minors/G-League, etc.) contribute only their two-way players.
          if (isCount || p.twoWay) players.push(p);
        }
      }
      rosters[t.abbr] = players;
      picks[t.abbr] = parseDraft(html);
      capHolds[t.abbr] = parseCapHolds(html);
      // Checksum against the Active total excludes two-way (non-cap) salaries.
      const sum2026 = players
        .filter((p) => !p.twoWay)
        .reduce((s, p) => s + (p.contract.find((c) => c.season === 2026)?.salary ?? 0), 0);
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

console.log('\nTeam   players  sum2026-27        checksum(exact?)');
let exact = 0;
const bad = [];
for (const r of report.sort((a, b) => a.abbr.localeCompare(b.abbr))) {
  if (r.ok) exact++;
  // Plausibility gates (independent of the flaky per-team total-row parse).
  if (r.n < 7 || r.n > 21) bad.push(`${r.abbr}: ${r.n} players`);
  if (r.sum2026 < 60_000_000 || r.sum2026 > 320_000_000) bad.push(`${r.abbr}: sum $${r.sum2026.toLocaleString()}`);
  console.log(
    `  ${r.abbr.padEnd(4)} ${String(r.n).padStart(3)}   $${r.sum2026.toLocaleString().padStart(14)}   $${r.checksum.toLocaleString().padStart(14)} ${r.ok ? 'exact' : ''}`
  );
}
// Offseason signings (separate page).
const signings = await fetchSignings();
console.log(`\nSignings: ${signings.count} parsed · ${signings.tracked} MLE/BAE tracked`);

// Bi-annual exception availability.
const bae = await fetchBae();
const baeAvail = Object.values(bae).filter((b) => b.space > 0).length;
console.log(`BAE: ${Object.keys(bae).length} teams · ${baeAvail} with room available`);

// Luxury-tax schedule + repeater flags.
const tax = await fetchTax();
const repN = Object.values(tax.repeaters).filter(Boolean).length;
const taxMiss = tax.validation.filter((v) => Math.abs(v.myBill - v.scrapedBill) > 1000);
console.log(`Tax: bracket $${tax.bracketWidth.toLocaleString()} · ${tax.standard.length} standard rates · ${repN} repeaters · bill checksum mismatches: ${taxMiss.length}/${tax.validation.length}`);
taxMiss.slice(0, 6).forEach((v) => console.log(`   ${v.abbr}: over $${v.over.toLocaleString()} rep=${v.isRep} mine $${v.myBill.toLocaleString()} vs $${v.scrapedBill.toLocaleString()}`));
if (tax.standard.length < 4 || Object.keys(tax.repeaters).length < 20) throw new Error('tax schedule parse looks wrong');
if (taxMiss.length > 3) throw new Error(`${taxMiss.length} tax-bill checksum mismatches — schedule parse likely off`);

const totalPlayers = Object.values(rosters).reduce((s, ps) => s + ps.length, 0);
const totalPicks = Object.values(picks).reduce((s, ps) => s + ps.length, 0);
console.log(`Total players: ${totalPlayers} · picks: ${totalPicks} · TPEs: ${tpeCount} · exact checksum matches: ${exact}/30`);
if (totalPicks < 200) throw new Error(`only ${totalPicks} draft picks parsed — draft table layout likely changed`);
// Fail only on real trouble: too few players, an implausible team, or the
// exact-match count collapsing (which would signal a systemic parse break).
if (totalPlayers < 300) throw new Error(`only ${totalPlayers} players — layout likely changed`);
if (bad.length) throw new Error(`implausible teams:\n  ${bad.join('\n  ')}`);
if (exact < 15) throw new Error(`only ${exact}/30 exact checksum matches — parse likely off`);

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
const totalHolds = Object.values(capHolds).reduce((s, hs) => s + hs.length, 0);
console.log(`Cap holds: ${totalHolds} across ${Object.keys(capHolds).length} teams`);
writeFileSync(
  'src/data/seededCapHolds.ts',
  `// AUTO-GENERATED cap holds from SalarySwish team pages.\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `//\n` +
    `// A cap hold is a placeholder charge that counts against a team's SALARY CAP\n` +
    `// (but not the tax/aprons) for an unsigned free agent or draft pick the team\n` +
    `// still controls. Split into veteran FA, restricted FA, and rookie-scale holds.\n\n` +
    `export type CapHoldType = 'veteran' | 'rfa' | 'draftPick';\n\n` +
    `export interface CapHold {\n` +
    `  player: string;\n` +
    `  /** Hold amount charged to the cap this season, in dollars. */\n` +
    `  amount: number;\n` +
    `  type: CapHoldType;\n` +
    `  /** SalarySwish "Terms"/status note (e.g. Bird, RFA, 120% RSC Hold). */\n` +
    `  terms?: string;\n` +
    `  age?: number;\n` +
    `}\n\n` +
    `// Keyed by team abbreviation.\n` +
    `export const SEEDED_CAP_HOLDS: Record<string, CapHold[]> = ${JSON.stringify(capHolds, null, 2)};\n`
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
writeFileSync(
  'src/data/seededPicks.ts',
  `// AUTO-GENERATED draft-pick ownership from SalarySwish (2027–2033).\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `import type { DraftPick } from '../types';\n\n` +
    `export const SEEDED_PICKS: Record<string, DraftPick[]> = ${JSON.stringify(picks, null, 2)};\n`
);
writeFileSync(
  'src/data/seededSignings.ts',
  `// AUTO-GENERATED offseason signings log from SalarySwish.\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `export const SEEDED_SIGNINGS = ${JSON.stringify(signings.lines.join('\n'))};\n`
);
writeFileSync(
  'src/data/seededBae.ts',
  `// AUTO-GENERATED bi-annual exception availability from SalarySwish.\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `export interface BaeInfo { initial: number; used: number; space: number; note: string; }\n\n` +
    `export const SEEDED_BAE: Record<string, BaeInfo> = ${JSON.stringify(bae, null, 2)};\n`
);
writeFileSync(
  'src/data/seededTax.ts',
  `// AUTO-GENERATED luxury-tax schedule + repeater flags from SalarySwish.\n` +
    `// Regenerate: node scripts/build-salaries.mjs\n` +
    `export interface TaxSchedule {\n` +
    `  bracketWidth: number;\n  standard: number[];\n  repeater: number[];\n  repeaters: Record<string, boolean>;\n}\n\n` +
    `export const SEEDED_TAX: TaxSchedule = ${JSON.stringify(
      { bracketWidth: tax.bracketWidth, standard: tax.standard, repeater: tax.repeater, repeaters: tax.repeaters },
      null,
      2
    )};\n`
);
console.log('\nWrote seededRosters.ts, teamMeta.ts, seededTradeExceptions.ts, seededPicks.ts, seededSignings.ts, seededBae.ts, seededTax.ts');
writeFileSync('build-salaries-report.txt', LOG);
}
