import type { Team } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { freeAgentQuiver } from '../lib/freeAgentQuiver';
import { money } from '../lib/format';

// Which signing "arrows" a team has this offseason, given cap/apron status —
// plus any rostered players already on an exception contract.

export function FreeAgentQuiver({ team }: { team: Team }) {
  const arrows = freeAgentQuiver(team, CURRENT_SEASON);

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
              <span className={`arrow-badge badge-${a.status}`}>
                {a.status === 'available' ? 'Available' : 'Unavailable'}
              </span>
              <span className="arrow-detail">{a.detail}</span>
            </div>
            {a.committed.length > 0 && (
              <div className="arrow-committed">
                On the books: {a.committed.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="quiver-foot">
        “On the books” shows rostered players on that exception type (from
        SalarySwish terms). It reflects the contract type, not which offseason the
        exception was spent.
      </div>
    </div>
  );
}
