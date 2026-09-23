// What to bet right now at a given set of books — the board's "Your bets"
// panel as plain text, for scheduled check-ins and quick looks.
//   npx tsx scripts/bets.ts draftkings [fanduel ...]
//
// Reads the live history, falls back to the sample fixture only when no live
// poll exists, and lists only games that have not kicked off.
import { oddsHistory } from '../src/nfl/data/oddsHistory';
import { sampleHistory } from '../src/nfl/data/sampleHistory';
import { readSlate } from '../src/nfl/lib/sharp';
import { findGame } from '../src/nfl/lib/market';
import { betLabel, recommend } from '../src/nfl/lib/edge';
import { bookName } from '../src/nfl/lib/books';
import { endOfNflWeek, priceLabel } from '../src/nfl/lib/format';

const books = process.argv.slice(2);
if (books.length === 0) {
  console.error('usage: npx tsx scripts/bets.ts <book> [book ...]   e.g. draftkings');
  process.exit(1);
}

const history = oddsHistory.snapshots.length > 0 ? oddsHistory : sampleHistory;
const latest = history.snapshots[history.snapshots.length - 1];
const now = Date.now();
const weekEnd = endOfNflWeek();
const ageMin = Math.round((now - new Date(history.updatedAt).getTime()) / 60_000);

const rows = readSlate(history)
  .filter((g) => {
    const t = new Date(g.commenceTime).getTime();
    return t > now && t < weekEnd;
  })
  .map((g) => ({ g, rec: recommend(g, findGame(latest.games, g.id), books) }))
  .sort((a, b) => (b.rec.best?.ev ?? -Infinity) - (a.rec.best?.ev ?? -Infinity));

const money = (ev: number) => `${ev >= 0 ? '+' : '-'}$${Math.abs(ev).toFixed(2)}`;
console.log(
  `${history.sample ? 'SAMPLE DATA — ' : ''}books: ${books.map(bookName).join(', ')} · ` +
    `last poll ${ageMin} min ago · ${rows.length} upcoming game(s)\n`
);

for (const { g, rec } of rows) {
  const b = rec.best;
  const matchup = `${g.awayTeam.split(' ').pop()} @ ${g.homeTeam.split(' ').pop()}`;
  const slip = b ? `${betLabel(b, g)} ${priceLabel(b.price)} at ${bookName(b.book)}` : '—';
  const ev = b ? `${money(b.ev)}/100` : '';
  const to = rec.verdict === 'bet' && b?.playableTo != null ? `good to ${priceLabel(b.playableTo)}` : '';
  console.log(
    `${rec.verdict.toUpperCase().padEnd(5)} ${matchup.padEnd(20)} ${slip.padEnd(32)} ${ev.padStart(9)}  ${to}`
  );
  if (rec.verdict !== 'pass') console.log(`      ${rec.reason}`);
}

const bets = rows.filter((r) => r.rec.verdict === 'bet').length;
console.log(`\n${bets} bet(s).`);
