import type { Team } from '../types';
import { BUNDLED_ROSTERS, CURRENT_SEASON, SEASONS } from '../data/leagueConstants';
import {
  apronStatusLine,
  nextApronNote,
  summarizeTeamSeason,
  TIER_INFO,
  type SeasonSalarySummary,
} from '../lib/apron';
import { getRosterStatus } from '../lib/teamStore';
import { money, seasonLabel, whenUpdated } from '../lib/format';

// ---------------------------------------------------------------------------
// The headline cap report for a team: a big 2025-26 total with its apron
// standing, a ladder of over/under to each threshold, and a five-year forward
// outlook so the apron trajectory reads at a glance.
// ---------------------------------------------------------------------------

export function CapSummary({ team }: { team: Team }) {
  const current = summarizeTeamSeason(team, CURRENT_SEASON);
  const info = TIER_INFO[current.tier];
  const forecast = SEASONS.map((s) => summarizeTeamSeason(team, s));
  const note = nextApronNote(current);
  const status = getRosterStatus(team.abbreviation);

  return (
    <div className="cap-summary">
      <div className="cs-masthead">
        <span className="cs-kicker">Cap Report</span>
        <h2 className="cs-team">{team.name}</h2>
        <span className="cs-sub">
          {seasonLabel(CURRENT_SEASON)} · {current.cap.projected ? 'projected' : 'official'} cap
        </span>
        <span className={`cs-roster-stamp${status.imported ? ' stamp-live' : ''}`}>
          {status.imported ? (
            <>
              <span className="stamp-dot" aria-hidden /> Roster imported
              {whenUpdated(status.updatedAt) && <> · updated {whenUpdated(status.updatedAt)}</>}
            </>
          ) : BUNDLED_ROSTERS.verified ? (
            <>Roster as of {whenUpdated(BUNDLED_ROSTERS.asOf)}</>
          ) : (
            <>Sample roster (illustrative) · import to load live figures</>
          )}
        </span>
      </div>

      <div className="cs-hero">
        <div className="cs-total-block">
          <span className="cs-total-label">Total Committed Salary</span>
          <span className="cs-total-value">{money(current.totalSalary)}</span>
        </div>
        <div className={`cs-status-block tier-accent-${info.color}`}>
          <span className={`tier-badge tier-${info.color}`}>{info.label}</span>
          <span className="cs-status-line">{apronStatusLine(current)}</span>
          {note && <span className="cs-status-note">{note}</span>}
        </div>
      </div>

      <div className="cs-ladder">
        <LadderRow label="Salary Cap" value={current.cap.salaryCap} space={current.spaceUnderCap} />
        <LadderRow label="Luxury Tax" value={current.cap.luxuryTax} space={current.spaceUnderTax} />
        <LadderRow
          label="First Apron"
          value={current.cap.firstApron}
          space={current.spaceUnderFirstApron}
          emphasize
        />
        <LadderRow
          label="Second Apron"
          value={current.cap.secondApron}
          space={current.spaceUnderSecondApron}
          emphasize
        />
      </div>

      <div className="cs-forecast">
        <span className="cs-kicker">Five-Year Outlook</span>
        <div className="cs-forecast-grid">
          {forecast.map((s) => (
            <ForecastCell key={s.season} s={s} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LadderRow({
  label,
  value,
  space,
  emphasize,
}: {
  label: string;
  value: number;
  space: number;
  emphasize?: boolean;
}) {
  const over = space < 0;
  return (
    <div className={`cs-ladder-row${emphasize ? ' cs-ladder-emph' : ''}`}>
      <span className="cs-ladder-label">{label}</span>
      <span className="cs-ladder-value">{money(value)}</span>
      <span className={`cs-ladder-space ${over ? 'space-over' : 'space-under'}`}>
        {over ? `${money(-space)} over` : `${money(space)} under`}
      </span>
    </div>
  );
}

function ForecastCell({ s }: { s: SeasonSalarySummary }) {
  const info = TIER_INFO[s.tier];
  return (
    <div className={`cs-fc-cell tier-accent-${info.color}`}>
      <span className="cs-fc-season">
        {seasonLabel(s.season)}
        {s.cap.projected && <sup className="cs-fc-proj" title="Projected cap"> proj</sup>}
      </span>
      <span className="cs-fc-total">{money(s.totalSalary)}</span>
      <span className={`tier-chip tier-${info.color}`}>{info.label}</span>
      <span className="cs-fc-note">{apronStatusLine(s)}</span>
    </div>
  );
}
