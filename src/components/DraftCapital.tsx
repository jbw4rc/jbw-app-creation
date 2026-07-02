import { useState } from 'react';
import type { DraftPick, Team } from '../types';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { frozenPickYear, summarizeTeamSeason } from '../lib/apron';
import { seasonLabel } from '../lib/format';

// Draft-capital cupboard. Picks with conditions (protections, swaps, unresolved
// ownership) or a frozen second-apron pick are tap-to-expand for the details.

function pickDetail(p: DraftPick, isFrozen: boolean): string | null {
  if (isFrozen)
    return `Frozen: over the second apron this first-round pick (${p.year}) cannot be traded.`;
  if (!p.notes) return null;
  // Trim SalarySwish's trailing "click to view full details" call-to-action.
  return p.notes.replace(/\.?\s*click to view full (?:trade )?details\.?/i, '').trim() || null;
}

export function DraftCapital({ team }: { team: Team }) {
  const current = summarizeTeamSeason(team, CURRENT_SEASON);
  const inSecondApron = current.tier === 'secondApron';
  const frozenYear = frozenPickYear(CURRENT_SEASON);
  const [open, setOpen] = useState<string | null>(null);

  const firsts = team.draftCapital.filter((p) => p.round === 1);
  const seconds = team.draftCapital.filter((p) => p.round === 2);
  const picks = [...firsts, ...seconds];

  return (
    <div className="draft-capital">
      <div className="draft-head">
        <span>Draft Capital</span>
        <span className="draft-count">
          {firsts.length} first-round · {seconds.length} second-round
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
        {picks.map((p, i) => {
          const isFrozen = inSecondApron && p.round === 1 && p.year === frozenYear;
          const key = `${p.year}-${p.round}-${p.originalTeam}-${i}`;
          const detail = pickDetail(p, isFrozen);
          const isOpen = open === key;
          return (
            <button
              key={key}
              type="button"
              className={`draft-pick round-${p.round}${p.encumbered ? ' encumbered' : ''}${
                isFrozen ? ' frozen' : ''
              }${detail ? ' has-detail' : ''}${isOpen ? ' open' : ''}`}
              onClick={detail ? () => setOpen(isOpen ? null : key) : undefined}
              aria-expanded={detail ? isOpen : undefined}
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
              {detail && !isFrozen && !p.encumbered && <div className="draft-info">i</div>}
            </button>
          );
        })}
      </div>

      {open &&
        (() => {
          const idx = picks.findIndex(
            (p, i) => `${p.year}-${p.round}-${p.originalTeam}-${i}` === open
          );
          const p = picks[idx];
          if (!p) return null;
          const isFrozen = inSecondApron && p.round === 1 && p.year === frozenYear;
          return (
            <div className={`draft-detail${isFrozen ? ' frozen' : ''}`}>
              <strong>
                {p.year} {p.round === 1 ? '1st' : '2nd'}
                {p.originalTeam !== team.abbreviation ? ` (${p.originalTeam})` : ''}
              </strong>
              <span>{pickDetail(p, isFrozen)}</span>
            </div>
          );
        })()}

      <div className="draft-placeholder-note">
        Pick ownership from SalarySwish (2027–2033). Incoming picks are tagged by
        original team; tap a pick marked <strong>COND.</strong> / <strong>FROZEN</strong> /{' '}
        <span className="draft-info-inline">i</span> for its conditions.
      </div>
    </div>
  );
}
