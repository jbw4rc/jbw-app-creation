// CSV imports — for portals the scanner should not crawl.
//
// Some portals ask robots not to crawl them (Texas ESBD's robots.txt is
// `Disallow: /`) or turn away non-browser clients (Georgia's registry), but
// let a person export search results as CSV. Drop those exports into
// scripts/fema/imports/ and every run folds them in like any other source.
//
// File naming: start the name with the two-letter state, e.g.
//   TX-esbd-2026-11-06.csv   GA-gpr-week45.csv
// The importer finds the columns by name, so it takes exports from any portal
// whose headers look like "Title", "Solicitation ID", "Agency", "Due Date"…
// Rows that do not score as PA work are dropped, so export broad searches.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RawOpportunity } from './types.ts';
import { usDate } from './http.ts';

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// Header synonyms, most specific first. Matched case- and punctuation-insensitively.
const COLUMNS = {
  title: ['solicitation title', 'project title', 'bid title', 'title', 'description', 'name'],
  number: ['solicitation id', 'solicitation number', 'solicitation #', 'bid number', 'bid #', 'rfp number', 'number', 'id'],
  agency: ['agency/texas smartbuy member name', 'agency name', 'agency', 'department', 'organization', 'entity', 'buyer'],
  due: ['response due date', 'response due', 'due date', 'closing date', 'close date', 'bid opening date', 'opening date', 'deadline'],
  dueTime: ['response time', 'response due time', 'due time', 'closing time'],
  posted: ['posting date', 'posted date', 'issue date', 'date issued', 'publish date', 'release date'],
  status: ['status', 'status name'],
  url: ['url', 'link', 'solicitation url'],
  codes: ['nigp codes', 'nigp code', 'class/item codes', 'commodity codes', 'category', 'categories'],
  state: ['state'],
} as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/#]+/g, ' ').trim();

export function mapHeaders(header: string[]): Partial<Record<keyof typeof COLUMNS, number>> {
  const h = header.map(norm);
  const out: Partial<Record<keyof typeof COLUMNS, number>> = {};
  const taken = new Set<number>();
  for (const [key, names] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, readonly string[]][]) {
    for (const n of names) {
      const i = h.findIndex((x, idx) => !taken.has(idx) && x === norm(n));
      if (i >= 0) { out[key] = i; taken.add(i); break; }
    }
  }
  return out;
}

const CLOSED = /\b(closed|cancel+ed|awarded|archived|expired)\b/i;

export function rowsToRaw(rows: string[][], file: string): RawOpportunity[] {
  if (rows.length < 2) return [];
  const col = mapHeaders(rows[0]);
  if (col.title === undefined) throw new Error(`${file}: no title column in [${rows[0].join(', ')}]`);
  const fileState = basename(file).match(/^([A-Za-z]{2})[-_ ]/)?.[1].toUpperCase();
  const at = (r: string[], k: keyof typeof COLUMNS) => (col[k] === undefined ? undefined : r[col[k]!]?.trim() || undefined);
  const out: RawOpportunity[] = [];
  for (const r of rows.slice(1)) {
    const title = at(r, 'title');
    if (!title) continue;
    if (CLOSED.test(at(r, 'status') ?? '')) continue;
    const number = at(r, 'number');
    const due = [at(r, 'due'), at(r, 'dueTime')].filter(Boolean).join(' ');
    out.push({
      id: `import:${fileState ?? 'XX'}:${number ?? title.toLowerCase().slice(0, 80)}`,
      source: 'import',
      sourceName: `CSV import (${basename(file)})`,
      title,
      agency: at(r, 'agency')?.replace(/\s+-\s+[A-Z]?\d{3,5}$/, '') ?? 'Unknown agency',
      state: at(r, 'state')?.toUpperCase().slice(0, 2) ?? fileState,
      solicitationNumber: number,
      summary: at(r, 'codes')?.replace(/\s*;\s*/g, '; ').slice(0, 600),
      postedDate: usDate(at(r, 'posted')),
      dueDate: usDate(due),
      url: at(r, 'url') || (fileState === 'TX' && number ? `https://www.txsmartbuy.gov/esbd/${encodeURIComponent(number)}` : '#'),
    });
  }
  return out;
}

export function readImports(dir: string): { file: string; records: RawOpportunity[]; error?: string }[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f: string) => f.toLowerCase().endsWith('.csv'))
    .sort()
    .map((f: string) => {
      const path = join(dir, f);
      try {
        return { file: f, records: rowsToRaw(parseCsv(readFileSync(path, 'utf8')), f) };
      } catch (e) {
        return { file: f, records: [], error: (e as Error).message };
      }
    });
}
