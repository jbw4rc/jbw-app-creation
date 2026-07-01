import type { ApronTier } from '../lib/apron';
import { restrictionsForTier, TIER_INFO } from '../lib/apron';

// Lists the roster-building tools a team has lost at its current tier, with the
// second-apron restrictions called out in red.

export function RestrictionPanel({ tier }: { tier: ApronTier }) {
  const restrictions = restrictionsForTier(tier);
  const info = TIER_INFO[tier];

  if (restrictions.length === 0) {
    return (
      <div className="restrictions restrictions-clear">
        <div className="restrictions-head">
          <span className={`tier-badge tier-${info.color}`}>{info.label}</span>
          <span>No apron restrictions — full roster-building flexibility.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="restrictions">
      <div className="restrictions-head">
        <span className={`tier-badge tier-${info.color}`}>{info.label}</span>
        <span>{restrictions.length} active restriction{restrictions.length > 1 ? 's' : ''}</span>
      </div>
      <ul className="restriction-list">
        {restrictions.map((r) => (
          <li
            key={r.id}
            className={`restriction-item ${
              r.appliesFrom === 'secondApron' ? 'from-second' : 'from-first'
            }`}
          >
            <div className="restriction-title">
              <span className="restriction-marker" aria-hidden />
              {r.title}
              <span className="restriction-tag">
                {r.appliesFrom === 'secondApron' ? '2nd Apron' : '1st Apron'}
              </span>
            </div>
            <div className="restriction-detail">{r.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
