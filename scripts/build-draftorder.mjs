// Pull Tankathon's projected draft board and write src/data/seededDraftOrder.ts:
// a map of origin-team -> projected first-round slot for the upcoming draft.
// Runs in CI (the dev sandbox can't reach the web). Tankathon orders the board
// by projected standings (in the offseason all records read 0-0, so the *order*
// is the signal, not the record), and it updates live once the season tips off.
// Usage: node scripts/build-draftorder.mjs
import { writeFileSync } from 'fs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Tankathon mobile abbreviation -> our abbreviation (only the ones that differ).
const FIX = { NO: 'NOP', GS: 'GSW', NY: 'NYK', SA: 'SAS' };
const VALID = new Set([
  'ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GSW', 'HOU',
  'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NOP', 'NYK', 'OKC', 'ORL',
  'PHI', 'PHX', 'POR', 'SAC', 'SAS', 'TOR', 'UTA', 'WAS',
]);
const fix = (a) => FIX[a] || a;

async function main() {
  const res = await fetch('https://www.tankathon.com/', {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
  });
  if (!res.ok) throw new Error(`tankathon -> ${res.status}`);
  const html = await res.text();

  const table = html.match(/<table class="draft-board">([\s\S]*?)<\/table>/);
  if (!table) throw new Error('draft-board table not found');

  const order = {};
  const rowRe = /<tr class="pick-row[^"]*">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(table[1]))) {
    const row = m[1];
    const numM = row.match(/<span class="pick-num">(\d+)<\/span>/);
    const nameCell = row.match(/<td class="name">([\s\S]*?)<\/td>/);
    if (!numM || !nameCell) continue;
    // The first mobile abbr in the name cell is the ORIGIN team (the one whose
    // projected finish sets the slot); a trade marker for the current owner may
    // follow but uses a desktop span, so it won't be picked up here.
    const abbrM = nameCell[1].match(/<div class="mobile">([A-Z]{2,3})<\/div>/);
    if (!abbrM) continue;
    const abbr = fix(abbrM[1]);
    const slot = parseInt(numM[1], 10);
    if (!VALID.has(abbr)) continue;
    // Keep each team's FIRST appearance = its first-round slot (round 2 repeats).
    if (!(abbr in order)) order[abbr] = slot;
  }

  const count = Object.keys(order).length;
  console.log(`parsed ${count} teams`);
  for (const [a, s] of Object.entries(order).sort((x, y) => x[1] - y[1])) {
    console.log(`  #${String(s).padStart(2)} ${a}`);
  }
  if (count < 25) {
    console.warn(`only ${count} teams parsed (<25) — writing empty, engine will fall back`);
  }

  const good = count >= 25;
  const seed = {
    season: nextDraftLabel(),
    asOf: new Date().toISOString(),
    source: 'Tankathon (projected)',
    order: good ? order : {},
  };

  const body = `// AUTO-GENERATED projected draft order from Tankathon.
// Regenerate: node scripts/build-draftorder.mjs
//
// order: origin-team abbreviation -> projected first-round board slot (1-30)
// for the upcoming draft. Tankathon orders by projected standings and updates
// live during the season. When fewer than 25 teams parse, order is left empty
// and the draft-value engine falls back to a DARKO team-strength ranking.

export interface DraftOrderSeed {
  season: string;
  asOf: string;
  source: string;
  order: Record<string, number>;
}

export const SEEDED_DRAFT_ORDER: DraftOrderSeed = ${JSON.stringify(seed, null, 2)};
`;
  writeFileSync('src/data/seededDraftOrder.ts', body);
  console.log('wrote src/data/seededDraftOrder.ts');
}

// The draft that follows the upcoming season. Tankathon's board is that draft.
function nextDraftLabel() {
  const now = new Date();
  // After the June draft, the board flips to the next year's draft.
  const y = now.getUTCFullYear();
  const draftYear = now.getUTCMonth() >= 6 ? y + 1 : y;
  return String(draftYear);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
