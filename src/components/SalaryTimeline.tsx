import type { Team } from '../types';
import { SEASONS } from '../data/leagueConstants';
import { summarizeTeamSeason, TIER_INFO } from '../lib/apron';
import { money, seasonLabel } from '../lib/format';

// Five-year bar chart of committed team salary vs. the second-apron line.

export function SalaryTimeline({ team }: { team: Team }) {
  const summaries = SEASONS.map((s) => summarizeTeamSeason(team, s));
  const scaleMax = Math.max(...summaries.map((s) => s.cap.secondApron)) * 1.15;

  return (
    <div className="timeline">
      <div className="timeline-title">5-Year Salary Outlook</div>
      <div className="timeline-bars">
        {summaries.map((s) => {
          const info = TIER_INFO[s.tier];
          const h = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;
          return (
            <div key={s.season} className="timeline-col">
              <div className="timeline-plot">
                <div
                  className="timeline-threshold t-apron2"
                  style={{ bottom: h(s.cap.secondApron) }}
                  title={`2nd Apron ${money(s.cap.secondApron)}`}
                />
                <div
                  className="timeline-threshold t-apron1"
                  style={{ bottom: h(s.cap.firstApron) }}
                  title={`1st Apron ${money(s.cap.firstApron)}`}
                />
                <div
                  className="timeline-threshold t-cap"
                  style={{ bottom: h(s.cap.salaryCap) }}
                  title={`Cap ${money(s.cap.salaryCap)}`}
                />
                <div
                  className={`timeline-bar fill-${info.color}`}
                  style={{ height: h(s.totalSalary) }}
                />
              </div>
              <div className="timeline-value">{money(s.totalSalary)}</div>
              <div className="timeline-season">
                {seasonLabel(s.season)}
                {s.cap.projected && <span className="proj-dot" title="Projected cap"> *</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="timeline-key">
        <span><i className="key-swatch t-cap" /> Cap</span>
        <span><i className="key-swatch t-apron1" /> 1st Apron</span>
        <span><i className="key-swatch t-apron2" /> 2nd Apron</span>
        <span className="timeline-note">* projected cap</span>
      </div>
    </div>
  );
}
