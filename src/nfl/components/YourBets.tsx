// The short answer to "what should I bet": every game where a book you have is
// hanging a price the sharp market says is wrong, best first.
import type { Recommendation } from '../lib/edge';
import { betLabel, BET_MIN_EV } from '../lib/edge';
import { bookName } from '../lib/books';
import { kickoffLabel, nickname, priceLabel } from '../lib/format';
import type { GameRead } from '../lib/sharp';
import { evLabel } from './BetLine';

interface Row {
  game: GameRead;
  rec: Recommendation;
}

export function YourBets({ rows, books }: { rows: Row[]; books: string[] }) {
  const bets = rows.filter((r) => r.rec.verdict === 'bet').sort((a, b) => b.rec.best!.ev - a.rec.best!.ev);
  const thin = rows.filter((r) => r.rec.verdict === 'thin').sort((a, b) => b.rec.best!.ev - a.rec.best!.ev);
  const where = books.map(bookName).join(', ');

  return (
    <section className="yours">
      <h3 className="yours__title">
        {bets.length > 0
          ? `${bets.length} bet${bets.length === 1 ? '' : 's'} at ${where}`
          : `No bets at ${where} right now`}
      </h3>
      {bets.length === 0 && (
        <p className="yours__none">
          Nothing on the board is worth {evLabel(BET_MIN_EV)} per $100 against the sharp price.
          That is the normal state of a market — most weeks most lines are fair. Check back after
          the next poll.
        </p>
      )}
      <ol className="yours__list">
        {[...bets, ...thin].map(({ game, rec }) => {
          const b = rec.best!;
          return (
            <li key={game.id} className="yours__row" data-verdict={rec.verdict}>
              <span className="yours__game">
                {nickname(game.awayTeam)} @ {nickname(game.homeTeam)}
                <span className="yours__time">{kickoffLabel(game.commenceTime)}</span>
              </span>
              <span className="yours__slip">
                {rec.verdict === 'thin' && <span className="yours__thin">thin</span>}
                <b>{betLabel(b, game)}</b> {priceLabel(b.price)}{' '}
                <span className="yours__book">{bookName(b.book)}</span>
              </span>
              <span className="yours__ev">
                {evLabel(b.ev)}
                {rec.verdict === 'bet' && b.playableTo !== null && (
                  <span className="yours__to">good to {priceLabel(b.playableTo)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {thin.length > 0 && (
        <p className="yours__foot">
          "Thin" edges are positive but small enough that normal model error could erase them,
          or they rest on a fair price without Pinnacle or Circa behind it. Not bets.
        </p>
      )}
    </section>
  );
}
