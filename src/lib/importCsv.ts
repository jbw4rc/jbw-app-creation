import type { ContractOption, ContractYear, Player } from '../types';

// ---------------------------------------------------------------------------
// Salary-table importer (source-agnostic).
//
// Handles two shapes of pasted salary data:
//
//   1. Clean tables — one row per player, delimited by commas (CSV, e.g.
//      Basketball-Reference's "Get table as CSV") or tabs. Salaries map to
//      seasons by column position.
//
//   2. SalarySwish-style copies — a player's row wraps across several physical
//      lines because option badges (P/T), Bird rights, and UFA/RFA each render
//      on their own line. Here the metadata (name, age, pos) sits on the first
//      line and the salary cells are recovered from the whole record in order,
//      mapped to consecutive seasons from the first season column. The P/T
//      badges are captured as player/team options.
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
  'status',
  'acquired',
  'terms',
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

/** Parse a salary cell: "$54,126,450", "54126450", "$54.1M", "1.2K" → dollars. */
function toDollars(cell: string): number | null {
  const t = cell.trim();
  if (!t || t === '-' || t === '—') return null;
  const suffix = t.match(/^\$?([\d,.]+)\s*([mMkK])\b/);
  if (suffix) {
    const n = parseFloat(suffix[1].replace(/,/g, ''));
    return Number.isFinite(n)
      ? Math.round(n * (/[mM]/.test(suffix[2]) ? 1_000_000 : 1_000))
      : null;
  }
  const digits = t.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "Towns, Karl-Anthony" → "Karl-Anthony Towns"; leave "First Last" as-is. */
function normalizeName(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : name.trim();
}

function isJunkName(name: string): boolean {
  if (/\$/.test(name)) return true; // section headers like "ACTIVE (11 - $...)"
  if (/^team\b/i.test(name) && /totals?\b/i.test(name)) return true; // "Team Totals"
  if (/^(active|inactive|two-?way|dead|totals?|salary|status|player|name)\b/i.test(name))
    return true;
  return !/[a-z]/i.test(name);
}

function badgeToOption(token: string): ContractOption | null {
  if (/^po?$/i.test(token)) return 'player';
  if (/^to?$/i.test(token)) return 'team';
  return null;
}

interface Layout {
  seasons: number[];
  firstSeasonIdx: number;
  nameCol: number;
  ageCol: number;
  posCol: number;
}

function buildPlayer(
  name: string,
  position: string,
  ageRaw: string,
  contract: ContractYear[],
  uid: number
): Player {
  const age = parseInt((ageRaw || '').replace(/[^\d]/g, ''), 10);
  return {
    id: `imp-${uid}-${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
    name: normalizeName(name),
    position: position?.trim() || '—',
    age: Number.isFinite(age) ? age : 0,
    contract,
  };
}

// --- Clean tables: salaries map to seasons by column position ---------------
function parseCleanRows(
  body: string[],
  delimiter: '\t' | ',',
  seasonCols: { idx: number; season: number }[],
  layout: Layout
): Player[] {
  const players: Player[] = [];
  let uid = 0;
  for (const line of body) {
    const fields = splitFields(line, delimiter);
    const name = (fields[layout.nameCol] || '').trim();
    if (!name || isJunkName(name)) continue;

    const contract: ContractYear[] = [];
    for (const { idx, season } of seasonCols) {
      const salary = toDollars(fields[idx] ?? '');
      if (salary !== null) contract.push({ season, salary, option: 'guaranteed' });
    }
    if (contract.length === 0) continue;
    players.push(
      buildPlayer(
        name,
        layout.posCol >= 0 ? fields[layout.posCol] : '',
        layout.ageCol >= 0 ? fields[layout.ageCol] : '',
        contract,
        (uid += 1)
      )
    );
  }
  return players;
}

// --- SalarySwish wrapped copies ---------------------------------------------
function parseWrappedRows(
  body: string[],
  delimiter: '\t' | ',',
  layout: Layout
): Player[] {
  // Group physical lines into records: a line with the delimiter starts a new
  // player; delimiter-less lines are continuation tokens for the current one.
  const records: { fields: string[]; extras: string[] }[] = [];
  let cur: { fields: string[]; extras: string[] } | null = null;
  for (const line of body) {
    if (line.includes(delimiter)) {
      if (cur) records.push(cur);
      cur = { fields: splitFields(line, delimiter), extras: [] };
    } else if (cur) {
      const t = line.trim();
      if (t) cur.extras.push(t);
    }
  }
  if (cur) records.push(cur);

  const { seasons, firstSeasonIdx, nameCol, ageCol, posCol } = layout;
  const players: Player[] = [];
  let uid = 0;
  for (const rec of records) {
    const name = (rec.fields[nameCol] || '').trim();
    if (!name || isJunkName(name)) continue;

    // Walk the record's salary region (first-line salary cells + continuation
    // tokens) in order, mapping dollars to consecutive seasons and honoring the
    // P/T option badge that immediately precedes a dollar.
    const stream = [...rec.fields.slice(firstSeasonIdx), ...rec.extras];
    const contract: ContractYear[] = [];
    let pending: ContractOption = 'guaranteed';
    let si = 0;
    for (const raw of stream) {
      const tok = (raw || '').trim();
      if (!tok) continue;
      const badge = badgeToOption(tok);
      if (badge) {
        pending = badge;
        continue;
      }
      const salary = toDollars(tok);
      if (salary !== null) {
        if (si < seasons.length) contract.push({ season: seasons[si], salary, option: pending });
        si += 1;
      }
      pending = 'guaranteed';
    }
    if (contract.length === 0) continue;
    players.push(
      buildPlayer(
        name,
        posCol >= 0 ? rec.fields[posCol] : '',
        ageCol >= 0 ? rec.fields[ageCol] : '',
        contract,
        (uid += 1)
      )
    );
  }
  return players;
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

  // Locate the header row: a name column and/or multiple season columns.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const fields = splitFields(lines[i], delimiter);
    const seasonCount = fields.filter((f) => SEASON_RE.test(f)).length;
    if (fields.some((f) => ['player', 'name'].includes(f.toLowerCase())) || seasonCount >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      players: [],
      seasons: [],
      warnings: [
        'Could not find a header row with season columns (e.g. 2026-27). Paste a salary table from SalarySwish, Basketball-Reference, or a similar source, including the header row.',
      ],
    };
  }

  const header = splitFields(lines[headerIdx], delimiter);
  const lower = header.map((f) => f.toLowerCase());
  const seasonCols = header
    .map((f, idx) => ({ idx, season: seasonStart(f) }))
    .filter((c): c is { idx: number; season: number } => c.season !== null);
  if (seasonCols.length === 0) {
    return { players: [], seasons: [], warnings: ['Found a header but no season columns (e.g. 2026-27).'] };
  }
  const seasonIdxs = new Set(seasonCols.map((c) => c.idx));

  let nameCol = lower.findIndex((f) => f === 'player' || f === 'name');
  if (nameCol === -1) {
    nameCol = header.findIndex((_, idx) => !seasonIdxs.has(idx) && !NON_NAME_HEADERS.has(lower[idx]));
  }
  if (nameCol === -1) nameCol = 0;

  const layout: Layout = {
    seasons: seasonCols.map((c) => c.season),
    firstSeasonIdx: seasonCols[0].idx,
    nameCol,
    ageCol: lower.findIndex((f) => f === 'age'),
    posCol: lower.findIndex((f) => f === 'pos' || f === 'position'),
  };

  const body = lines.slice(headerIdx + 1);
  const wrapped = body.some((l) => !l.includes(delimiter));
  const players = wrapped
    ? parseWrappedRows(body, delimiter, layout)
    : parseCleanRows(body, delimiter, seasonCols, layout);

  if (players.length === 0) {
    warnings.push('No player salary rows were parsed — double-check the pasted table.');
  } else {
    const missing: string[] = [];
    if (layout.posCol < 0) missing.push('positions');
    if (layout.ageCol < 0) missing.push('ages');
    warnings.push(
      `Imported ${players.length} players. Non-guaranteed flags aren't captured${
        missing.length ? `, and ${missing.join(' and ')} weren't found in the paste` : ''
      }; player/team options (P/T) are read when present.`
    );
  }

  return { players, seasons: layout.seasons, warnings };
}
