import type { ContractYear, Player } from '../types';

// ---------------------------------------------------------------------------
// Parser for Basketball-Reference contracts tables.
//
// On any BBRef contracts page (e.g. basketball-reference.com/contracts/BOS.html)
// the "Share & Export → Get table as CSV" button yields a comma-separated table
// with a Player column and one column per season ("2025-26", "2026-27", …).
// This turns that paste into the app's Player[] model.
//
// It is deliberately tolerant: BBRef's export sometimes keeps thousands-commas
// inside dollar amounts (which would break a naive split), so we strip those
// first. Contract options and positions/ages are not present in the contracts
// export, so imported years are treated as guaranteed.
// ---------------------------------------------------------------------------

export interface ParsedRoster {
  players: Player[];
  seasons: number[];
  warnings: string[];
}

const SEASON_RE = /\b(\d{4})-(\d{2})\b/;

function seasonStart(label: string): number | null {
  const m = label.match(SEASON_RE);
  return m ? parseInt(m[1], 10) : null;
}

/** Remove thousands-separator commas inside numbers so field splitting is safe. */
function stripThousands(line: string): string {
  return line.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1');
}

function toDollars(cell: string): number | null {
  const digits = cell.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function splitFields(line: string): string[] {
  return stripThousands(line)
    .split(',')
    .map((f) => f.trim().replace(/^"|"$/g, ''));
}

export function parseContractsCsv(text: string): ParsedRoster {
  const warnings: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { players: [], seasons: [], warnings: ['Nothing was pasted.'] };
  }

  // Locate the header row: has a "Player" column and/or multiple season columns.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const fields = splitFields(lines[i]);
    const seasonCount = fields.filter((f) => SEASON_RE.test(f)).length;
    if (fields.some((f) => f.toLowerCase() === 'player') || seasonCount >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      players: [],
      seasons: [],
      warnings: [
        'Could not find a header row with a "Player" column and season columns (e.g. 2025-26). Paste the CSV from a Basketball-Reference contracts table.',
      ],
    };
  }

  const header = splitFields(lines[headerIdx]);
  const playerCol = Math.max(
    0,
    header.findIndex((f) => f.toLowerCase() === 'player')
  );
  const seasonCols = header
    .map((f, idx) => ({ idx, season: seasonStart(f) }))
    .filter((c): c is { idx: number; season: number } => c.season !== null);

  if (seasonCols.length === 0) {
    return {
      players: [],
      seasons: [],
      warnings: ['Found a header but no season columns (e.g. 2025-26).'],
    };
  }

  const players: Player[] = [];
  let uid = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const fields = splitFields(lines[i]);
    const name = (fields[playerCol] || '').trim();
    if (!name || name.toLowerCase() === 'player') continue; // blank / repeated header
    if (/^team totals?$/i.test(name) || /^salary/i.test(name)) continue; // footer rows

    const contract: ContractYear[] = [];
    for (const { idx, season } of seasonCols) {
      const salary = toDollars(fields[idx] ?? '');
      if (salary !== null) contract.push({ season, salary, option: 'guaranteed' });
    }
    if (contract.length === 0) continue;

    uid += 1;
    players.push({
      id: `imp-${uid}-${name.replace(/[^a-z0-9]/gi, '').toLowerCase()}`,
      name,
      position: '—',
      age: 0,
      contract,
    });
  }

  if (players.length === 0) {
    warnings.push('No player salary rows were parsed — double-check the pasted CSV.');
  } else {
    warnings.push(
      'Options (player/team option, non-guaranteed) and positions/ages are not part of BBRef’s contracts export, so all imported years are treated as guaranteed.'
    );
  }

  return {
    players,
    seasons: seasonCols.map((c) => c.season),
    warnings,
  };
}
