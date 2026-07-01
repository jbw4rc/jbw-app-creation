import type { ContractYear, Player } from '../types';

// ---------------------------------------------------------------------------
// Salary-table importer (source-agnostic).
//
// Accepts a pasted salary table from SalarySwish, Basketball-Reference, or any
// similar source — whether copied straight from the page (tab-separated) or
// exported as CSV (comma-separated). It auto-detects the delimiter, finds the
// player-name column plus per-season salary columns (and Pos/Age when present),
// and tolerates dollar formats like "$54,126,450", "54126450", and "$54.1M".
//
// Options (player/team option, non-guaranteed) are not reliably present in
// these exports, so imported years are treated as guaranteed.
// ---------------------------------------------------------------------------

export interface ParsedRoster {
  players: Player[];
  seasons: number[];
  warnings: string[];
}

// Matches "2026-27", "2026/27", "2026-2027", or a bare "2026".
const SEASON_RE = /\b(20\d{2})(?:\s*[-/–]\s*(?:\d{2}|\d{4}))?\b/;

const NON_NAME_HEADERS = new Set([
  '',
  'rk',
  'pos',
  'position',
  'age',
  'team',
  'tm',
  'total',
  'guaranteed',
  'gtd',
  'signed using',
  'notes',
  'cap hit',
]);

function seasonStart(label: string): number | null {
  const m = label.match(SEASON_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Remove thousands-separator commas inside numbers so comma-splitting is safe. */
function stripThousands(line: string): string {
  return line.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
}

function splitFields(line: string, delimiter: '\t' | ','): string[] {
  const prepared = delimiter === ',' ? stripThousands(line) : line;
  return prepared.split(delimiter).map((f) => f.trim().replace(/^"|"$/g, ''));
}

/** Parse a salary cell: "$54,126,450", "54126450", "$54.1M", "1.2K", "" → null. */
function toDollars(cell: string): number | null {
  const t = cell.trim();
  if (!t || t === '-' || t === '—') return null;
  const suffix = t.match(/([\d,.]+)\s*([mMkK])\b/);
  if (suffix) {
    const n = parseFloat(suffix[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * (/[mM]/.test(suffix[2]) ? 1_000_000 : 1_000));
  }
  const digits = t.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseContractsCsv(text: string): ParsedRoster {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { players: [], seasons: [], warnings: ['Nothing was pasted.'] };
  }

  const delimiter: '\t' | ',' = lines.some((l) => l.includes('\t')) ? '\t' : ',';

  // Find the header row: has a name column and/or multiple season columns.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const fields = splitFields(lines[i], delimiter);
    const seasonCount = fields.filter((f) => SEASON_RE.test(f)).length;
    const hasName = fields.some((f) =>
      ['player', 'name'].includes(f.toLowerCase())
    );
    if (hasName || seasonCount >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      players: [],
      seasons: [],
      warnings: [
        'Could not find a header row with a player column and season columns (e.g. 2026-27). Paste a salary table from SalarySwish, Basketball-Reference, or a similar source.',
      ],
    };
  }

  const header = splitFields(lines[headerIdx], delimiter);
  const lower = header.map((f) => f.toLowerCase());

  const seasonCols = header
    .map((f, idx) => ({ idx, season: seasonStart(f) }))
    .filter((c): c is { idx: number; season: number } => c.season !== null);
  if (seasonCols.length === 0) {
    return {
      players: [],
      seasons: [],
      warnings: ['Found a header but no season columns (e.g. 2026-27).'],
    };
  }
  const seasonIdxs = new Set(seasonCols.map((c) => c.idx));

  let nameCol = lower.findIndex((f) => f === 'player' || f === 'name');
  if (nameCol === -1) {
    nameCol = header.findIndex(
      (_, idx) => !seasonIdxs.has(idx) && !NON_NAME_HEADERS.has(lower[idx])
    );
  }
  if (nameCol === -1) nameCol = 0;

  const posCol = lower.findIndex((f) => f === 'pos' || f === 'position');
  const ageCol = lower.findIndex((f) => f === 'age');

  const players: Player[] = [];
  let uid = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitFields(lines[i], delimiter);
    const name = (fields[nameCol] || '').trim();
    if (!name || ['player', 'name'].includes(name.toLowerCase())) continue;
    if (/^team totals?$/i.test(name) || /^(salary|totals?)\b/i.test(name)) continue;

    const contract: ContractYear[] = [];
    for (const { idx, season } of seasonCols) {
      const salary = toDollars(fields[idx] ?? '');
      if (salary !== null) contract.push({ season, salary, option: 'guaranteed' });
    }
    if (contract.length === 0) continue;

    const age = ageCol >= 0 ? parseInt((fields[ageCol] || '').replace(/[^\d]/g, ''), 10) : 0;
    players.push({
      id: `imp-${(uid += 1)}-${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      name,
      position: (posCol >= 0 ? fields[posCol] : '')?.trim() || '—',
      age: Number.isFinite(age) ? age : 0,
      contract,
    });
  }

  if (players.length === 0) {
    warnings.push('No player salary rows were parsed — double-check the pasted table.');
  } else {
    const extras: string[] = [];
    if (posCol < 0) extras.push('positions');
    if (ageCol < 0) extras.push('ages');
    warnings.push(
      `Contract options (player/team option, non-guaranteed) aren't part of these exports, so imported years are treated as guaranteed${
        extras.length ? `; ${extras.join(' and ')} weren't found in the paste` : ''
      }.`
    );
  }

  return { players, seasons: seasonCols.map((c) => c.season), warnings };
}
