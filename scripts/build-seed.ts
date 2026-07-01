// Parse the SalarySwish .xlsx (one tab per team) into src/data/seededRosters.ts.
// Run: npx tsx scripts/build-seed.ts <path-to-xlsx>
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { parseContractsCsv } from '../src/lib/importCsv';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

const XLSX_PATH = process.argv[2] || 'data-src/SalarySwish.xlsx';

interface TeamDef {
  sheet: string;
  abbr: string;
  name: string;
  conf: 'East' | 'West';
}

const TEAMS: TeamDef[] = [
  { sheet: 'Atlanta Hawks', abbr: 'ATL', name: 'Atlanta Hawks', conf: 'East' },
  { sheet: 'Boston Celtics', abbr: 'BOS', name: 'Boston Celtics', conf: 'East' },
  { sheet: 'Brooklyn Nets', abbr: 'BKN', name: 'Brooklyn Nets', conf: 'East' },
  { sheet: 'Charlotte Hornets', abbr: 'CHA', name: 'Charlotte Hornets', conf: 'East' },
  { sheet: 'Chicago Bulls', abbr: 'CHI', name: 'Chicago Bulls', conf: 'East' },
  { sheet: 'Cleveland Cavaliers', abbr: 'CLE', name: 'Cleveland Cavaliers', conf: 'East' },
  { sheet: 'Dallas Mavericks', abbr: 'DAL', name: 'Dallas Mavericks', conf: 'West' },
  { sheet: 'Denver Nuggets', abbr: 'DEN', name: 'Denver Nuggets', conf: 'West' },
  { sheet: 'Detroit Pistons', abbr: 'DET', name: 'Detroit Pistons', conf: 'East' },
  { sheet: 'Golden State Warriors', abbr: 'GSW', name: 'Golden State Warriors', conf: 'West' },
  { sheet: 'Houston Rockets', abbr: 'HOU', name: 'Houston Rockets', conf: 'West' },
  { sheet: 'Indiana Pacers', abbr: 'IND', name: 'Indiana Pacers', conf: 'East' },
  { sheet: 'LA Clippers', abbr: 'LAC', name: 'LA Clippers', conf: 'West' },
  { sheet: 'LA Lakers', abbr: 'LAL', name: 'Los Angeles Lakers', conf: 'West' },
  { sheet: 'Memphis Grizzlies', abbr: 'MEM', name: 'Memphis Grizzlies', conf: 'West' },
  { sheet: 'Miami Heat', abbr: 'MIA', name: 'Miami Heat', conf: 'East' },
  { sheet: 'Milwaukee Bucks', abbr: 'MIL', name: 'Milwaukee Bucks', conf: 'East' },
  { sheet: 'Minnesota TWolves', abbr: 'MIN', name: 'Minnesota Timberwolves', conf: 'West' },
  { sheet: 'New Orleans Pelicans', abbr: 'NOP', name: 'New Orleans Pelicans', conf: 'West' },
  { sheet: 'New York Knicks', abbr: 'NYK', name: 'New York Knicks', conf: 'East' },
  { sheet: 'Oklahoma City Thunder', abbr: 'OKC', name: 'Oklahoma City Thunder', conf: 'West' },
  { sheet: 'Orlando Magic', abbr: 'ORL', name: 'Orlando Magic', conf: 'East' },
  { sheet: 'Philadelphia 76ers', abbr: 'PHI', name: 'Philadelphia 76ers', conf: 'East' },
  { sheet: 'Phoenix Suns', abbr: 'PHX', name: 'Phoenix Suns', conf: 'West' },
  { sheet: 'Portland Trailblazers', abbr: 'POR', name: 'Portland Trail Blazers', conf: 'West' },
  { sheet: 'Sacramento Kings', abbr: 'SAC', name: 'Sacramento Kings', conf: 'West' },
  { sheet: 'San Antonio Spurs', abbr: 'SAS', name: 'San Antonio Spurs', conf: 'West' },
  { sheet: 'Toronto Raptors', abbr: 'TOR', name: 'Toronto Raptors', conf: 'East' },
  { sheet: 'Utah Jazz', abbr: 'UTA', name: 'Utah Jazz', conf: 'West' },
  { sheet: 'Washington Wizards', abbr: 'WAS', name: 'Washington Wizards', conf: 'East' },
];

/**
 * Flatten a sheet (array-of-arrays) into the line format the importer expects:
 * a multi-cell row → tab-joined line; a column-0-only row (Bird/UFA/P/$…) →
 * a bare continuation token.
 */
function sheetToText(rows: string[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = (row ?? []).map((c) => String(c ?? '').trim());
    if (cells.every((c) => c === '')) continue;
    const onlyCol0 = cells[0] !== '' && cells.slice(1).every((c) => c === '');
    lines.push(onlyCol0 ? cells[0] : cells.join('\t'));
  }
  return lines.join('\n');
}

function statedTotal(rows: string[][]): number {
  const header = String(rows[0]?.[0] ?? '');
  const m = header.match(/\$([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}

const wb = XLSX.readFile(XLSX_PATH);
const out: Record<string, unknown> = {};
const meta: TeamDef[] = [];
let good = 0;
const problems: string[] = [];

for (const t of TEAMS) {
  const sheet = wb.Sheets[t.sheet];
  if (!sheet) {
    problems.push(`${t.abbr}: missing sheet "${t.sheet}"`);
    continue;
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as string[][];
  const parsed = parseContractsCsv(sheetToText(rows));
  const sum = parsed.players.reduce(
    (s, p) => s + (p.contract.find((c) => c.season === 2026)?.salary ?? 0),
    0
  );
  const stated = statedTotal(rows);
  const match = stated === 0 || Math.abs(sum - stated) < 2000;
  console.log(
    `${t.abbr.padEnd(4)} players ${String(parsed.players.length).padStart(2)}  ` +
      `sum $${sum.toLocaleString()}  stated $${stated.toLocaleString()}  ${match ? 'OK' : '*** MISMATCH'}`
  );
  if (match) good += 1;
  else problems.push(`${t.abbr}: sum ${sum} != stated ${stated}`);
  out[t.abbr] = parsed.players;
  meta.push(t);
}

console.log(`\n${good}/${TEAMS.length} teams checksum-matched.`);
if (problems.length) console.log('Problems:\n' + problems.join('\n'));

const rostersBody =
  `// AUTO-GENERATED from the SalarySwish export — do not edit by hand.\n` +
  `// Regenerate: npx tsx scripts/build-seed.ts <xlsx>\n` +
  `import type { Player } from '../types';\n\n` +
  `export const SEEDED_ROSTERS: Record<string, Player[]> = ${JSON.stringify(out, null, 2)};\n`;
writeFileSync('src/data/seededRosters.ts', rostersBody);

const metaBody =
  `// AUTO-GENERATED team directory (abbr, name, conference).\n` +
  `export interface TeamMeta { abbreviation: string; name: string; conference: 'East' | 'West'; }\n\n` +
  `export const TEAM_META: TeamMeta[] = ${JSON.stringify(
    meta.map((m) => ({ abbreviation: m.abbr, name: m.name, conference: m.conf })),
    null,
    2
  )};\n`;
writeFileSync('src/data/teamMeta.ts', metaBody);

console.log('\nWrote src/data/seededRosters.ts and src/data/teamMeta.ts');
