import { useMemo, useState } from 'react';
import { TEAMS } from '../data/teams';
import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { summarizeSeason } from '../lib/apron';
import { evaluateSigning, type SigningOption } from '../lib/freeAgent';
import { money } from '../lib/format';
import { ApronMeter } from './ApronMeter';

// The Free Agent Machine: pick a team and a target salary, and see which signing
// tools are legal — with second-apron teams correctly limited to minimums.

// Presets are derived from the focal season's cap so exception figures stay
// in sync with the thresholds shown elsewhere.
const focalCap = getSeasonCap(CURRENT_SEASON);
const PRESETS = [
  { label: `Star (${money(40_000_000)})`, value: 40_000_000 },
  { label: `Starter (${money(20_000_000)})`, value: 20_000_000 },
  { label: `MLE (${money(focalCap.nonTaxpayerMLE)})`, value: focalCap.nonTaxpayerMLE },
  { label: `Taxpayer MLE (${money(focalCap.taxpayerMLE)})`, value: focalCap.taxpayerMLE },
  { label: `Minimum (${money(2_200_000)})`, value: 2_200_000 },
];

export function FreeAgentMachine() {
  const [abbr, setAbbr] = useState('BOS');
  const [target, setTarget] = useState(focalCap.nonTaxpayerMLE);

  const team = TEAMS.find((t) => t.abbreviation === abbr)!;
  const evalResult = useMemo(
    () => evaluateSigning(team, CURRENT_SEASON, target),
    [team, target]
  );
  const preSummary = summarizeSeason(evalResult.preSalary, CURRENT_SEASON);
  const postSummary = summarizeSeason(evalResult.preSalary + target, CURRENT_SEASON);

  return (
    <div className="fa-machine">
      <div className="fa-controls">
        <label className="fa-field">
          <span>Team</span>
          <select value={abbr} onChange={(e) => setAbbr(e.target.value)}>
            {TEAMS.map((t) => (
              <option key={t.abbreviation} value={t.abbreviation}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="fa-field fa-field-grow">
          <span>Target first-year salary: {money(target)}</span>
          <input
            type="range"
            min={2_200_000}
            max={60_000_000}
            step={100_000}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="fa-presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={`fa-preset${target === p.value ? ' active' : ''}`}
            onClick={() => setTarget(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="fa-verdict-row">
        {evalResult.recommended ? (
          <div className="verdict verdict-legal">
            <span className="verdict-icon">✓</span> Sign with{' '}
            <strong>{evalResult.recommended.label}</strong> ({money(target)})
          </div>
        ) : (
          <div className="verdict verdict-illegal">
            <span className="verdict-icon">✕</span> No legal tool reaches {money(target)}
          </div>
        )}
      </div>

      {evalResult.violations.map((v, i) => (
        <div key={i} className={`fa-note note-${v.severity}`}>
          <strong>{v.title}.</strong> {v.detail}
        </div>
      ))}

      <div className="fa-tools">
        {evalResult.options.map((o) => (
          <ToolCard key={o.tool} option={o} target={target} />
        ))}
      </div>

      <div className="fa-beforeafter">
        <div className="ba-block">
          <div className="ba-label">Current</div>
          <ApronMeter summary={preSummary} />
        </div>
        <div className="ba-arrow">→</div>
        <div className="ba-block">
          <div className="ba-label">After signing {money(target)}</div>
          <ApronMeter summary={postSummary} />
        </div>
      </div>
    </div>
  );
}

function ToolCard({ option, target }: { option: SigningOption; target: number }) {
  const covers = option.available && option.maxSalary + 1 >= target;
  const state = !option.available ? 'blocked' : covers ? 'covers' : 'short';
  return (
    <div className={`tool-card tool-${state}`}>
      <div className="tool-name">{option.label}</div>
      <div className="tool-max">{money(option.maxSalary)}</div>
      <div className="tool-status">
        {!option.available
          ? option.blockedReason ?? 'Unavailable'
          : covers
            ? 'Covers target'
            : 'Too small for target'}
      </div>
      {option.hardCaps && option.available && (
        <div className="tool-hardcap">
          Hard-caps at {option.hardCaps === 'firstApron' ? '1st' : '2nd'} apron
        </div>
      )}
    </div>
  );
}
