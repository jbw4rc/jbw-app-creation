import type { Team } from '../types';
import { BUNDLED_ROSTERS, CURRENT_SEASON, SEASONS } from '../data/leagueConstants';
import {
  apronStatusLine,
  MIN_ROSTER,
  nextApronNote,
  rosterFillProjection,
  summarizeTeamSeason,
  TIER_INFO,
  type SeasonSalarySummary,
} from '../lib/apron';
import { getRosterStatus } from '../lib/teamStore';
import { toggleRepeater, useRepeater } from '../lib/repeaterStore';
import { computeTax, marginalRateAt } from '../lib/luxuryTax';
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
  const repeater = useRepeater(team.abbreviation);

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
            <>
              Roster as of {BUNDLED_ROSTERS.asOfLabel}
              {BUNDLED_ROSTERS.source ? ` · ${BUNDLED_ROSTERS.source}` : ''}
            </>
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

      <RosterFill summary={current} team={team} />

      <div className="cs-ladder">
        <LadderRow label="Salary Cap" value={current.cap.salaryCap} space={current.spaceUnderCap} />
        <LadderRow
          label="Luxury Tax"
          value={current.cap.luxuryTax}
          space={current.spaceUnderTax}
          rateNote={`~${marginalRateAt(current.cap.luxuryTax + 1, current.cap.luxuryTax, repeater).toFixed(2)}× and up`}
        />
        <LadderRow
          label="First Apron"
          value={current.cap.firstApron}
          space={current.spaceUnderFirstApron}
          rateNote={`~${marginalRateAt(current.cap.firstApron, current.cap.luxuryTax, repeater).toFixed(2)}× tax`}
          emphasize
        />
        <LadderRow
          label="Second Apron"
          value={current.cap.secondApron}
          space={current.spaceUnderSecondApron}
          rateNote={`~${marginalRateAt(current.cap.secondApron, current.cap.luxuryTax, repeater).toFixed(2)}× tax`}
          emphasize
        />
      </div>

      <TaxCost
        summary={current}
        repeater={repeater}
        onToggleRepeater={() => toggleRepeater(team.abbreviation)}
      />

      <div className="cs-forecast">
        <span className="cs-kicker">Five-Year Outlook</span>
        <div className="cs-forecast-grid">
          {forecast.map((s) => (
            <ForecastCell key={s.season} s={s} repeater={repeater} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RosterFill({ summary, team }: { summary: SeasonSalarySummary; team: Team }) {
  const fill = rosterFillProjection(team, summary.season);
  if (fill.open <= 0) return null;

  const cap = summary.cap;
  const cur = summary.totalSalary;
  const crossesSecond = cur < cap.secondApron && fill.projectedTotal >= cap.secondApron;
  const crossesFirst = cur < cap.firstApron && fill.projectedTotal >= cap.firstApron;
  const crossesTax = cur < cap.luxuryTax && fill.projectedTotal >= cap.luxuryTax;
  const crossNote = crossesSecond
    ? ' — inevitably over the second apron'
    : crossesFirst
      ? ' — inevitably over the first apron'
      : crossesTax
        ? ' — inevitably into the luxury tax'
        : '';

  return (
    <div className={`cs-fill${crossNote ? ' cs-fill-warn' : ''}`}>
      <span className="cs-fill-head">
        Incomplete roster · {fill.count} of {MIN_ROSTER} signed
      </span>
      <span className="cs-fill-body">
        Filling {fill.open} spot{fill.open > 1 ? 's' : ''} at the minimum adds ≈{' '}
        {money(fill.fillCost)} → <strong>{money(fill.projectedTotal)}</strong> (
        {TIER_INFO[fill.projectedTier].label}){crossNote}</span>
    </div>
  );
}

function LadderRow({
  label,
  value,
  space,
  rateNote,
  emphasize,
}: {
  label: string;
  value: number;
  space: number;
  rateNote?: string;
  emphasize?: boolean;
}) {
  const over = space < 0;
  return (
    <div className={`cs-ladder-row${emphasize ? ' cs-ladder-emph' : ''}`}>
      <span className="cs-ladder-label">
        {label}
        {rateNote && <span className="cs-ladder-rate">{rateNote}</span>}
      </span>
      <span className="cs-ladder-value">{money(value)}</span>
      <span className={`cs-ladder-space ${over ? 'space-over' : 'space-under'}`}>
        {over ? `${money(-space)} over` : `${money(space)} under`}
      </span>
    </div>
  );
}

// The luxury-tax bill and the total cash cost to ownership (payroll + tax),
// with the progressive rate bands the team is paying into.
function TaxCost({
  summary,
  repeater,
  onToggleRepeater,
}: {
  summary: SeasonSalarySummary;
  repeater: boolean;
  onToggleRepeater: () => void;
}) {
  const tax = computeTax(summary.totalSalary, summary.cap.luxuryTax, repeater);
  const filled = tax.bands.filter((b) => b.used > 0);
  return (
    <div className="cs-tax">
      <div className="cs-tax-head">
        <span className="cs-kicker">Cost to Ownership · Luxury Tax</span>
        <button
          className={`repeater-toggle${repeater ? ' on' : ''}`}
          onClick={onToggleRepeater}
          title="Taxpayer in three of the last four seasons pays steeper rates"
        >
          <span className="repeater-box">{repeater ? '✓' : ''}</span>
          Repeater rates
        </button>
      </div>
      <div className="cs-tax-figures">
        <div className="cs-tax-fig">
          <span className="cs-tax-fig-label">Est. Luxury-Tax Bill</span>
          <span className={`cs-tax-fig-value${tax.bill > 0 ? ' tax-red' : ''}`}>
            {money(tax.bill)}
          </span>
        </div>
        <div className="cs-tax-fig">
          <span className="cs-tax-fig-label">Payroll + Tax</span>
          <span className="cs-tax-fig-value">{money(summary.totalSalary + tax.bill)}</span>
        </div>
        <div className="cs-tax-fig">
          <span className="cs-tax-fig-label">Marginal Rate</span>
          <span className="cs-tax-fig-value">
            {tax.over > 0 ? `${tax.marginalRate.toFixed(2)}×` : '—'}
          </span>
        </div>
      </div>

      {tax.over > 0 ? (
        <div className="cs-tax-bands">
          {filled.map((b) => (
            <div key={b.label} className="cs-tax-band">
              <span className="cs-tax-band-label">{b.label}</span>
              <span className="cs-tax-band-rate">{b.rate.toFixed(2)}×</span>
              <span className="cs-tax-band-used">{money(b.used)}</span>
              <span className="cs-tax-band-cost">{money(b.cost)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="cs-tax-note">
          {money(summary.spaceUnderTax)} below the tax line — no tax bill. Rates
          rise by bracket (SalarySwish schedule); repeater teams pay the steeper set.
        </div>
      )}
      <div className="cs-tax-foot">
        {repeater
          ? 'Repeater rates (taxpayer in three of the last four seasons), estimated.'
          : 'Standard (non-repeater) rates, estimated — toggle repeater above for the steeper schedule.'}
      </div>
    </div>
  );
}

function ForecastCell({ s, repeater }: { s: SeasonSalarySummary; repeater: boolean }) {
  const info = TIER_INFO[s.tier];
  const tax = computeTax(s.totalSalary, s.cap.luxuryTax, repeater);
  return (
    <div className={`cs-fc-cell tier-accent-${info.color}`}>
      <span className="cs-fc-season">
        {seasonLabel(s.season)}
        {s.cap.projected && <sup className="cs-fc-proj" title="Projected cap"> proj</sup>}
      </span>
      <span className="cs-fc-total">{money(s.totalSalary)}</span>
      <span className={`tier-chip tier-${info.color}`}>{info.label}</span>
      <span className="cs-fc-note">{apronStatusLine(s)}</span>
      <span className="cs-fc-tax">
        {tax.bill > 0 ? `+ ${money(tax.bill)} tax` : 'no tax'}
      </span>
    </div>
  );
}
