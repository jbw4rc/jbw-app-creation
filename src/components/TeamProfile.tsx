import { teamProfile, type ProfileDim, type ProfileGroup } from '../lib/teamProfile';
import { useMinutesVersion } from '../lib/minutesStore';

// ---------------------------------------------------------------------------
// Team profile panel — a league-relative scouting read. Each axis is a gauge
// filled to the team's percentile (longer = better), colored by tone (green
// strength / red weakness), with the rank and, for weak axes, the archetype to
// go acquire. Grouped into offense and defense.
// ---------------------------------------------------------------------------

const GROUPS: { id: ProfileGroup; label: string }[] = [
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
];

function ProfileRow({ d }: { d: ProfileDim }) {
  return (
    <div className={`tp-row tp-${d.tone}`} title={d.detail}>
      <div className="tp-labelcell">
        <span className="tp-label">{d.label}</span>
        {d.targetArchetype && <span className="tp-target">need · {d.targetArchetype}</span>}
      </div>
      <div className="tp-track">
        <div className="tp-fill" style={{ width: `${Math.max(4, d.pct)}%` }} />
      </div>
      <span className="tp-rank">#{d.rank}</span>
    </div>
  );
}

export function TeamProfile({ abbr }: { abbr: string }) {
  useMinutesVersion(); // re-render when minutes change the profile
  const dims = teamProfile(abbr);
  if (!dims.length) return null;

  return (
    <div className="tp-panel">
      <div className="tp-panel-head">
        <span className="gm-card-title">Team profile</span>
        <span className="gm-card-sub">where you rank across the league · red = a hole to fill</span>
      </div>
      {GROUPS.map((g) => (
        <div className="tp-group" key={g.id}>
          <span className="tp-group-label">{g.label}</span>
          {dims.filter((d) => d.group === g.id).map((d) => (
            <ProfileRow key={d.key} d={d} />
          ))}
        </div>
      ))}
    </div>
  );
}
