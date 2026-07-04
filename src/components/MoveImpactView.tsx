import type { MoveImpact } from '../lib/moveImpact';
import { TIER_INFO, type ApronTier } from '../lib/apron';
import { TIER_META } from '../lib/teamTalent';
import { money } from '../lib/format';

// Renders a move's win-now impact: DARKO talent + rank shift, tax/apron status
// flip, and the true cost including the luxury-tax swing. Shared by the trade
// grade cards and the signing analysis.

const APRON_ORDER: Record<ApronTier, number> = {
  underCap: 0,
  overCap: 1,
  overTax: 2,
  firstApron: 3,
  secondApron: 4,
};

function apronFlipNote(before: ApronTier, after: ApronTier): { text: string; worse: boolean } | null {
  if (before === after) return null;
  const worse = APRON_ORDER[after] > APRON_ORDER[before];
  const becomes: Partial<Record<ApronTier, string>> = {
    overTax: 'Becomes a taxpayer',
    firstApron: 'Becomes a first-apron team',
    secondApron: 'Becomes a second-apron team',
    overCap: 'Goes over the cap',
    underCap: 'Drops under the cap',
  };
  if (worse) return { text: becomes[after] ?? `→ ${TIER_INFO[after].label}`, worse: true };
  const drops: Partial<Record<ApronTier, string>> = {
    firstApron: 'Drops below the second apron',
    overTax: 'Drops below the first apron',
    overCap: 'Drops out of the tax',
    underCap: 'Opens cap space',
  };
  return { text: drops[after] ?? `→ ${TIER_INFO[after].label}`, worse: false };
}

const signed = (n: number, digits = 1) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;

export function MoveImpactView({ impact }: { impact: MoveImpact }) {
  const dpmDelta = impact.afterDpm - impact.beforeDpm;
  const rankUp = impact.beforeOverall - impact.afterOverall; // + = climbed (lower number)
  const confUp = impact.beforeConf - impact.afterConf;
  const flip = apronFlipNote(impact.apronBefore, impact.apronAfter);
  const tierChanged = impact.beforeTier !== impact.afterTier;
  const taxDelta = impact.taxAfter - impact.taxBefore;
  const trueCost = impact.postSalary - impact.preSalary + taxDelta;

  return (
    <div className="mi">
      <div className="mi-row">
        <span className="mi-label">Talent</span>
        <span className="mi-val">
          {signed(impact.beforeDpm)} → <strong>{signed(impact.afterDpm)}</strong>
          <span className={`mi-delta ${dpmDelta >= 0 ? 'mi-up' : 'mi-down'}`}>
            {' '}
            ({signed(dpmDelta)})
          </span>
        </span>
      </div>

      <div className="mi-row">
        <span className="mi-label">Rank</span>
        <span className="mi-val">
          NBA #{impact.beforeOverall} → <strong>#{impact.afterOverall}</strong>
          {rankUp !== 0 && (
            <span className={`mi-delta ${rankUp > 0 ? 'mi-up' : 'mi-down'}`}>
              {' '}
              {rankUp > 0 ? '▲' : '▼'}
              {Math.abs(rankUp)}
            </span>
          )}
          <span className="mi-sep">·</span>
          Conf #{impact.beforeConf} → #{impact.afterConf}
          {confUp !== 0 && (
            <span className={`mi-delta ${confUp > 0 ? 'mi-up' : 'mi-down'}`}>
              {' '}
              {confUp > 0 ? '▲' : '▼'}
              {Math.abs(confUp)}
            </span>
          )}
        </span>
      </div>

      <div className="mi-row">
        <span className="mi-label">Tier</span>
        <span className="mi-val">
          <span className={`tier-chip tier-${TIER_META[impact.beforeTier].color}`}>
            {TIER_META[impact.beforeTier].label}
          </span>
          {tierChanged && (
            <>
              {' → '}
              <span className={`tier-chip tier-${TIER_META[impact.afterTier].color}`}>
                {TIER_META[impact.afterTier].label}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="mi-row">
        <span className="mi-label">Status</span>
        <span className="mi-val">
          <span className={`mi-apron tier-accent-${TIER_INFO[impact.apronBefore].color}`}>
            {TIER_INFO[impact.apronBefore].label}
          </span>
          {flip && (
            <>
              {' → '}
              <span className={`mi-apron tier-accent-${TIER_INFO[impact.apronAfter].color}`}>
                {TIER_INFO[impact.apronAfter].label}
              </span>
              <span className={`mi-flip ${flip.worse ? 'mi-flip-worse' : 'mi-flip-better'}`}>
                {flip.text}
              </span>
            </>
          )}
        </span>
      </div>

      <div className="mi-row mi-cost">
        <span className="mi-label">True cost</span>
        <span className="mi-val">
          {money(impact.postSalary - impact.preSalary)} salary{' '}
          {taxDelta >= 0 ? '+' : '−'} {money(Math.abs(taxDelta))} tax ={' '}
          <strong className={trueCost >= 0 ? 'mi-cost-pos' : 'mi-cost-neg'}>
            {money(trueCost)}
          </strong>
        </span>
      </div>
    </div>
  );
}
