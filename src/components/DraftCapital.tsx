import type { Team } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { frozenPickYear, summarizeTeamSeason } from '../lib/apron';
import { seasonLabel } from '../lib/format';

// Draft-capital cupboard. When the team is in the second apron in the current
// season, the pick seven drafts out is flagged as frozen.

export function DraftCapital({ team }: { team: Team }) {
  const current = summarizeTeamSeason(team, CURRENT_SEASON);
  const inSecondApron = current.tier === 'secondApron';
  const frozenYear = frozenPickYear(CURRENT_SEASON);

  const firsts = team.draftCapital.filter((p) => p.round === 1);
  const seconds = team.draftCapital.filter((p) => p.round === 2);

  return (
    <div className="draft-capital">
      <div className="draft-head">
        <span>Draft Capital</span>
        <span className="draft-count">
          {firsts.length} first{firsts.length !== 1 ? 's' : ''} · {seconds.length} second
          {seconds.length !== 1 ? 's' : ''}
        </span>
      </div>

      {inSecondApron && (
        <div className="frozen-note">
          In the second apron: the {seasonLabel(frozenYear)} first-round pick is
          <strong> frozen</strong> and cannot be traded. Staying in the second
          apron for 3 of 5 years drops it to the end of the first round.
        </div>
      )}

      <div className="draft-grid">
        {[...firsts, ...seconds].map((p, i) => {
          const isFrozen = inSecondApron && p.round === 1 && p.year === frozenYear;
          return (
            <div
              key={`${p.year}-${p.round}-${p.originalTeam}-${i}`}
              className={`draft-pick round-${p.round}${p.encumbered ? ' encumbered' : ''}${
                isFrozen ? ' frozen' : ''
              }`}
              title={p.notes ?? ''}
            >
              <div className="draft-pick-year">{p.year}</div>
              <div className="draft-pick-round">
                {p.round === 1 ? '1st' : '2nd'}
                {p.originalTeam !== team.abbreviation && (
                  <span className="draft-via"> · {p.originalTeam}</span>
                )}
              </div>
              {isFrozen && <div className="draft-flag">FROZEN</div>}
              {!isFrozen && p.encumbered && <div className="draft-flag muted">COND.</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
