import type { Team } from '../types';
import { financialFlexibility, type FlexHorizon } from '../lib/financialFlexibility';
import { TIER_INFO } from '../lib/apron';
import { seasonLabel, money } from '../lib/format';
import type { Grade } from '../lib/grade';

// Financial flexibility card: a grade + one-liner for "now" and "future books",
// plus a locked-salary trajectory (each season's guaranteed money as a share of
// that year's second-apron line).

export function GradePill({ grade }: { grade: Grade }) {
  return <span className={`grade-pill grade-${grade.tone}`}>{grade.letter}</span>;
}

function HorizonRow({ h }: { h: FlexHorizon }) {
  return (
    <div className="ff-horizon">
      <GradePill grade={h.grade} />
      <div className="ff-horizon-body">
        <span className="ff-horizon-label">{h.label}</span>
        <span className="ff-horizon-blurb">{h.blurb}</span>
      </div>
    </div>
  );
}

export function FinancialCard({ team }: { team: Team }) {
  const flex = financialFlexibility(team);
  return (
    <div className="gm-card">
      <div className="gm-card-head">
        <span className="gm-card-title">Financial flexibility</span>
        <span className="gm-card-sub">room to operate — now &amp; down the line</span>
      </div>
      <HorizonRow h={flex.now} />
      <HorizonRow h={flex.future} />
      <div className="ff-traj">
        <span className="ff-traj-label">Locked salary · guaranteed + player options</span>
        {flex.trajectory.map((p) => {
          const info = TIER_INFO[p.tier];
          return (
            <div className="ff-traj-row" key={p.season} title={`${info.label} · ${money(p.committed)}`}>
              <span className="ff-traj-season">{seasonLabel(p.season)}</span>
              <div className="ff-traj-track">
                <div
                  className={`ff-traj-fill tier-${info.color}`}
                  style={{ width: `${Math.max(3, p.fillToSecondApron * 100)}%` }}
                />
              </div>
              <span className="ff-traj-amt">{money(p.committed)}</span>
            </div>
          );
        })}
        <span className="ff-traj-foot">bar = share of that season's 2nd-apron line</span>
      </div>
    </div>
  );
}
