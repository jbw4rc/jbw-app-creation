import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { money, seasonLabel } from '../lib/format';

// A slim, always-visible band stating the four league thresholds for the focal
// season so the cap / tax / first apron / second apron numbers are explicit
// everywhere in the app.

export function LeagueThresholds() {
  const cap = getSeasonCap(CURRENT_SEASON);
  const items: { label: string; value: number; cls: string }[] = [
    { label: 'Salary Cap', value: cap.salaryCap, cls: 'lt-cap' },
    { label: 'Luxury Tax', value: cap.luxuryTax, cls: 'lt-tax' },
    { label: 'First Apron', value: cap.firstApron, cls: 'lt-apron1' },
    { label: 'Second Apron', value: cap.secondApron, cls: 'lt-apron2' },
  ];
  return (
    <div className="league-thresholds">
      <span className="lt-title">
        {seasonLabel(CURRENT_SEASON)} Thresholds
        <span className="lt-official">{cap.projected ? 'projected' : 'official'}</span>
      </span>
      <div className="lt-items">
        {items.map((it) => (
          <div key={it.label} className={`lt-item ${it.cls}`}>
            <span className="lt-label">{it.label}</span>
            <span className="lt-value">{money(it.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
