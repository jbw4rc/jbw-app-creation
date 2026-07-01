import type { Team } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { freeAgentQuiver, type ArrowStatus } from '../lib/freeAgentQuiver';
import { signingsCount, usedExceptionsFor, useSignings } from '../lib/signingsStore';
import { money } from '../lib/format';

// Which signing "arrows" a team has this offseason, given cap/apron status.
// With an offseason transactions list imported, arrows already spent flip to
// "Used" (with the player and method).

const BADGE: Record<ArrowStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  used: 'Used',
};

export function FreeAgentQuiver({ team }: { team: Team }) {
  useSignings(); // re-render when the transactions list changes
  const haveSignings = signingsCount() > 0;
  const arrows = freeAgentQuiver(team, CURRENT_SEASON, usedExceptionsFor(team.abbreviation));

  return (
    <div className="quiver">
      <div className="quiver-head">
        <span>Free Agent Quiver</span>
        <span className="quiver-sub">Signing tools this offseason</span>
      </div>

      <div className="quiver-list">
        {arrows.map((a) => (
          <div key={a.key} className={`arrow arrow-${a.status}`}>
            <div className="arrow-main">
              <span className="arrow-name">{a.name}</span>
              <span className="arrow-amount">{a.amount != null ? money(a.amount) : '—'}</span>
            </div>
            <div className="arrow-row">
              <span className={`arrow-badge badge-${a.status}`}>{BADGE[a.status]}</span>
              <span className="arrow-detail">{a.detail}</span>
            </div>
            {a.usedBy.length > 0 && (
              <div className="arrow-used">Spent this offseason on {a.usedBy.join(', ')}</div>
            )}
          </div>
        ))}
      </div>

      <div className="quiver-foot">
        {haveSignings
          ? '“Used” is drawn from the imported offseason signings (mechanism + date).'
          : 'Import an offseason signings list (Import tab) to light up which exceptions have been spent.'}
      </div>
    </div>
  );
}
