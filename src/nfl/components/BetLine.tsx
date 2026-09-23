// The bet itself, written the way it goes on a slip: side, number, price, book.
// The Sharp Score says where the money went; this says whether what is left on
// the board at your books is worth taking.
import type { Recommendation } from '../lib/edge';
import { betLabel } from '../lib/edge';
import { bookName } from '../lib/books';
import { priceLabel } from '../lib/format';
import type { GameRead } from '../lib/sharp';

const VERDICT = { bet: 'Bet', thin: 'Thin', pass: 'Pass' } as const;

export function evLabel(ev: number): string {
  return `${ev >= 0 ? '+' : '−'}$${Math.abs(ev).toFixed(2)}`;
}

export function BetLine({ rec, game }: { rec: Recommendation; game: GameRead }) {
  const b = rec.best;
  return (
    <div className="bet" data-verdict={rec.verdict}>
      <span className="bet__verdict">{VERDICT[rec.verdict]}</span>
      {b && rec.verdict !== 'pass' ? (
        <span className="bet__slip">
          <b>{betLabel(b, game)}</b> <span className="bet__price">{priceLabel(b.price)}</span>{' '}
          <span className="bet__book">at {bookName(b.book)}</span>
        </span>
      ) : (
        <span className="bet__slip bet__slip--none">
          {b ? 'Nothing worth betting at your books' : rec.reason}
        </span>
      )}
      {b && (
        <span className="bet__ev">
          {evLabel(b.ev)} <span className="bet__per">per $100</span>
          {rec.verdict === 'bet' && b.playableTo !== null && (
            <span className="bet__to"> · good to {priceLabel(b.playableTo)}</span>
          )}
        </span>
      )}
    </div>
  );
}
