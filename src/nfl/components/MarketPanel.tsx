// One market (spread or total) for one game: the two consensus numbers side by
// side, what moved since the opener, the five signals, and the per-book board.
//
// The sharp/retail pair is the headline because it is the thing a bettor cannot
// see on any single sportsbook's app — you only get it by holding two books'
// numbers next to each other, which is the entire premise of this tool.
import { useState } from 'react';
import type { GameRead, MarketRead } from '../lib/sharp';
import { sideLabel } from '../lib/sharp';
import { SignalList } from './SignalList';
import { bookName, bookTier } from '../lib/books';
import { impliedMargin, impliedTotal, hold } from '../lib/market';
import {
  deltaLabel, holdLabel, priceLabel, spreadLabel, totalLabel,
} from '../lib/format';
import type { GameQuote } from '../types';

function num(read: MarketRead, value: number): string {
  return read.market === 'spread' ? spreadLabel(value) : totalLabel(value);
}

export function MarketPanel({
  read,
  game,
  quote,
}: {
  read: MarketRead;
  game: GameRead;
  quote: GameQuote | undefined;
}) {
  const [showBooks, setShowBooks] = useState(false);
  const gap = read.sharp.mu - read.retail.mu;
  const label = read.market === 'spread' ? 'Spread' : 'Total';

  return (
    <section className="market">
      <header className="market__head">
        <h4>{label}</h4>
        <div className="market__verdict">
          <span className="tag tag--sharp">
            Sharp: <b>{sideLabel(read.sharpSide, game)}</b>
          </span>
          <span className="tag tag--square">
            Public: <b>{sideLabel(read.squareSide, game)}</b>
          </span>
        </div>
      </header>

      <div className="numbers">
        <div className="numbers__cell">
          <span className="numbers__k">Sharp books</span>
          <span className="numbers__v">
            {read.market === 'spread'
              ? `${game.homeTeam.split(' ').pop()} ${num(read, read.sharp.line)}`
              : num(read, read.sharp.line)}
          </span>
          <span className="numbers__s">
            {read.sharp.count} books · {holdLabel(read.sharp.hold)} hold
          </span>
        </div>
        <div className="numbers__cell">
          <span className="numbers__k">Retail books</span>
          <span className="numbers__v">
            {read.market === 'spread'
              ? `${game.homeTeam.split(' ').pop()} ${num(read, read.retail.line)}`
              : num(read, read.retail.line)}
          </span>
          <span className="numbers__s">
            {read.retail.count} books · {holdLabel(read.retail.hold)} hold
          </span>
        </div>
        <div className="numbers__cell numbers__cell--accent">
          <span className="numbers__k">Shade</span>
          <span className="numbers__v">{deltaLabel(gap)}</span>
          <span className="numbers__s">
            retail off sharp, toward {sideLabel(read.squareSide, game)}
          </span>
        </div>
        <div className="numbers__cell">
          <span className="numbers__k">Since open</span>
          <span className="numbers__v">{deltaLabel(read.moveMu)}</span>
          <span className="numbers__s">
            opened {num(read, read.openLine)} → now {num(read, read.sharp.line)}
          </span>
        </div>
      </div>

      {read.coverage < 100 && (
        <p className="market__partial">
          Partial read — {read.coverage} of 100 points of signal available.{' '}
          {read.moveMu === undefined || Number.isNaN(read.moveMu)
            ? 'Movement reads need at least two polls of line history.'
            : 'Some signals do not apply to this market.'}
        </p>
      )}

      <SignalList read={read} game={game} />

      <button className="linkbtn" onClick={() => setShowBooks((v) => !v)}>
        {showBooks ? 'Hide' : 'Show'} all {quote?.books.length ?? 0} books
      </button>

      {showBooks && quote && (
        <table className="books">
          <thead>
            <tr>
              <th>Book</th>
              <th>Tier</th>
              <th>{read.market === 'spread' ? 'Home' : 'Over'}</th>
              <th>{read.market === 'spread' ? 'Away' : 'Under'}</th>
              <th>Implied</th>
              <th>Hold</th>
            </tr>
          </thead>
          <tbody>
            {[...quote.books]
              .filter((b) => (read.market === 'spread' ? b.spread : b.total))
              .sort((a, b) => bookTier(a.book).localeCompare(bookTier(b.book)))
              .map((b) => {
                const isSpread = read.market === 'spread';
                const mu = isSpread ? impliedMargin(b.spread!) : impliedTotal(b.total!);
                const h = isSpread
                  ? hold(b.spread!.homePrice, b.spread!.awayPrice)
                  : hold(b.total!.overPrice, b.total!.underPrice);
                return (
                  <tr key={b.book} data-tier={bookTier(b.book)}>
                    <td>{bookName(b.book)}</td>
                    <td className="books__tier">{bookTier(b.book)}</td>
                    <td className="books__num">
                      {isSpread
                        ? `${spreadLabel(b.spread!.homePoint)} (${priceLabel(b.spread!.homePrice)})`
                        : `${totalLabel(b.total!.point)} (${priceLabel(b.total!.overPrice)})`}
                    </td>
                    <td className="books__num">
                      {isSpread
                        ? `${spreadLabel(b.spread!.awayPoint)} (${priceLabel(b.spread!.awayPrice)})`
                        : `${totalLabel(b.total!.point)} (${priceLabel(b.total!.underPrice)})`}
                    </td>
                    <td className="books__num">{mu.toFixed(2)}</td>
                    <td className="books__num">{holdLabel(h)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
    </section>
  );
}
