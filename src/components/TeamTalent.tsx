import type { Team } from '../types';
import { teamTalent, TIER_META } from '../lib/teamTalent';

// Team talent readout: DARKO net rating, NBA and conference rank, and the
// contender / playoff / fringe / cellar bar.

export function TeamTalent({ team }: { team: Team }) {
  const t = teamTalent(team.abbreviation);
  if (!t) return null;
  const meta = TIER_META[t.tier];

  return (
    <div className="team-talent">
      <div className="tt-head">
        <span className="cs-kicker">Team Talent · DARKO</span>
        <span className={`tier-badge tier-${meta.color}`}>{meta.label}</span>
      </div>
      <div className="tt-body">
        <div className="tt-metric">
          <span className="tt-dpm">
            {t.dpm >= 0 ? '+' : '−'}
            {Math.abs(t.dpm).toFixed(1)}
          </span>
          <span className="tt-dpm-label">
            net rating
            <br />
            (DARKO DPM)
          </span>
        </div>
        <div className="tt-ranks">
          <div className="tt-rank">
            <span className="tt-rank-num">#{t.overallRank}</span>
            <span className="tt-rank-lbl">of 30 · NBA</span>
          </div>
          <div className="tt-rank">
            <span className="tt-rank-num">#{t.confRank}</span>
            <span className="tt-rank-lbl">of 15 · {t.conference}</span>
          </div>
        </div>
      </div>
      <p className="tt-foot">
        Rotation talent = minutes-weighted sum of the top players' DARKO DPM
        (≈ expected net rating). Tier by NBA rank: 1–6 contender, 7–16 playoff,
        17–22 fringe, 23–30 cellar.
      </p>
    </div>
  );
}
