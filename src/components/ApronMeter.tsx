import type { SeasonSalarySummary } from '../lib/apron';
import { TIER_INFO } from '../lib/apron';
import { money, seasonLabel, spaceLabel } from '../lib/format';

// A horizontal gauge showing where a team's salary sits against the four
// thresholds, with the second apron emphasized.

interface Props {
  summary: SeasonSalarySummary;
  /** Show the full threshold legend beneath the bar. */
  detailed?: boolean;
}

export function ApronMeter({ summary, detailed = false }: Props) {
  const { cap, totalSalary, tier } = summary;
  const info = TIER_INFO[tier];

  // Scale the bar so the second apron sits at ~78% width, leaving headroom.
  const scaleMax = cap.secondApron * 1.28;
  const pct = (v: number) => `${Math.min(100, (v / scaleMax) * 100)}%`;

  const lines = [
    { label: 'Cap', value: cap.salaryCap, cls: 'line-cap' },
    { label: 'Tax', value: cap.luxuryTax, cls: 'line-tax' },
    { label: '1st Apron', value: cap.firstApron, cls: 'line-apron1' },
    { label: '2nd Apron', value: cap.secondApron, cls: 'line-apron2' },
  ];

  return (
    <div className="apron-meter">
      <div className="apron-meter-head">
        <span className="apron-meter-season">{seasonLabel(summary.season)}</span>
        <span className={`tier-badge tier-${info.color}`}>{info.label}</span>
        <span className="apron-meter-total">{money(totalSalary)}</span>
      </div>

      <div className="apron-track">
        <div
          className={`apron-fill fill-${info.color}`}
          style={{ width: pct(totalSalary) }}
        />
        {lines.map((l) => (
          <div
            key={l.label}
            className={`apron-line ${l.cls}`}
            style={{ left: pct(l.value) }}
            title={`${l.label}: ${money(l.value)}`}
          >
            <span className="apron-line-tick" />
          </div>
        ))}
      </div>

      {detailed && (
        <div className="apron-legend">
          <LegendRow
            label="Salary Cap"
            value={money(cap.salaryCap)}
            space={spaceLabel(summary.spaceUnderCap)}
            over={summary.spaceUnderCap < 0}
          />
          <LegendRow
            label="Luxury Tax"
            value={money(cap.luxuryTax)}
            space={spaceLabel(summary.spaceUnderTax)}
            over={summary.spaceUnderTax < 0}
          />
          <LegendRow
            label="First Apron"
            value={money(cap.firstApron)}
            space={spaceLabel(summary.spaceUnderFirstApron)}
            over={summary.spaceUnderFirstApron < 0}
          />
          <LegendRow
            label="Second Apron"
            value={money(cap.secondApron)}
            space={spaceLabel(summary.spaceUnderSecondApron)}
            over={summary.spaceUnderSecondApron < 0}
            emphasize
          />
        </div>
      )}
    </div>
  );
}

function LegendRow({
  label,
  value,
  space,
  over,
  emphasize,
}: {
  label: string;
  value: string;
  space: string;
  over: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className={`legend-row${emphasize ? ' legend-emphasize' : ''}`}>
      <span className="legend-label">{label}</span>
      <span className="legend-value">{value}</span>
      <span className={`legend-space ${over ? 'space-over' : 'space-under'}`}>
        {space}
      </span>
    </div>
  );
}
