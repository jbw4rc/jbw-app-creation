// A game in the ranked slate: collapsed it is one scannable line, expanded it
// opens both markets. The collapsed row carries the whole verdict — score,
// sharp side, public side — so the ranking is readable without opening anything.
import { useState } from 'react';
import type { GameRead } from '../lib/sharp';
import { scoreBand, sideLabel } from '../lib/sharp';
import { ScoreDial } from './ScoreDial';
import { MarketPanel } from './MarketPanel';
import { kickoffLabel, nickname } from '../lib/format';
import type { GameQuote } from '../types';

export function GameRow({
  read,
  rank,
  quote,
}: {
  read: GameRead;
  rank: number;
  quote: GameQuote | undefined;
}) {
  const [open, setOpen] = useState(false);
  const best = read.best;
  // Below the "lean" line the net is basically noise, and naming a side in
  // green would dress up a coin flip as a play. Say there is nothing instead.
  const hasEdge = scoreBand(best.score).tone !== 'noise';

  return (
    <article className={`game ${open ? 'game--open' : ''}`}>
      <button className="game__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="game__rank">{rank}</span>
        <span className="game__teams">
          <span className="game__matchup">
            {nickname(read.awayTeam)} <span className="game__at">@</span> {nickname(read.homeTeam)}
          </span>
          <span className="game__time">{kickoffLabel(read.commenceTime)}</span>
        </span>
        <span className="game__verdict">
          <span className="game__market">{best.market}</span>
          {hasEdge ? (
            <>
              <span className="game__side">{sideLabel(best.sharpSide, read)}</span>
              <span className="game__vs">
                over the public on {sideLabel(best.squareSide, read)}
              </span>
            </>
          ) : (
            <>
              <span className="game__side game__side--none">No clear edge</span>
              <span className="game__vs">signals cancel out — nothing to fade</span>
            </>
          )}
        </span>
        <ScoreDial score={best.score} compact />
        <span className="game__chev" aria-hidden>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="game__body">
          <MarketPanel read={read.spread} game={read} quote={quote} />
          <MarketPanel read={read.total} game={read} quote={quote} />
        </div>
      )}
    </article>
  );
}
