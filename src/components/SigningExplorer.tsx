import { useMemo, useState } from 'react';
import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { SEEDED_DARKO } from '../data/seededDarko';
import { SEEDED_CAP_HOLDS } from '../data/seededCapHolds';
import { TEAMS } from '../data/teams';
import { useTeams, getSelectedTeam, setSelectedTeam } from '../lib/teamStore';
import {
  MIN_FILL_SALARY,
  rosteredCount,
  summarizeTeamSeason,
  teamSalaryForSeason,
  TIER_INFO,
} from '../lib/apron';
import { money } from '../lib/format';
import { projectedContract, CONTRACT_MODEL_INFO } from '../lib/contractModel';
import { buildSignedPlayer } from '../lib/signAndTrade';
import { moveImpact } from '../lib/moveImpact';
import { FreeAgentQuiver } from './FreeAgentQuiver';
import { MoveImpactView } from './MoveImpactView';

// Signing Explorer: browse the remaining free agents (with DARKO-projected
// salaries), pick a team, and model what signing a player would take — via the
// team's Bird rights, cap room (renouncing holds to open space), or an exception.

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Players currently on a roster (so the rest of DARKO = free agents).
const ROSTERED = new Set<string>();
for (const t of TEAMS) for (const p of t.players) ROSTERED.add(norm(p.name));

// Which team holds each free agent's rights (from cap holds), by normalized name.
const RIGHTS: Record<string, string> = {};
for (const [abbr, holds] of Object.entries(SEEDED_CAP_HOLDS))
  for (const h of holds) RIGHTS[norm(h.player)] = abbr;

interface FA {
  name: string;
  key: string;
  value: number; // DARKO fair-value benchmark, $M
  projected: number; // modeled market contract, $M
  dpm: number | null;
  age: number | null;
  pos: string | null;
  posNum: number | null;
  rights: string | null; // team abbr holding Bird rights, if any
}

/** value − projected: positive = bargain, negative = overpay. */
const quality = (f: FA) => f.value - f.projected;

const FA_POOL: FA[] = Object.entries(SEEDED_DARKO)
  .filter(([key]) => !ROSTERED.has(key))
  .map(([key, d]) => {
    const value = d.value ?? 0;
    const age = d.age ?? 27;
    const projected = projectedContract(value, age, d.dpm ?? 0).salary;
    return {
      name: d.name,
      key,
      value,
      projected,
      dpm: d.dpm ?? null,
      age: d.age ?? null,
      pos: d.pos ?? null,
      posNum: d.posNum ?? null,
      rights: RIGHTS[key] ?? null,
    };
  })
  .sort((a, b) => b.projected - a.projected);

type PosGroup = 'all' | 'G' | 'F' | 'C';

// Bucket a free agent into guard / forward / center (by DARKO position number,
// falling back to the position string).
function posGroup(fa: FA): 'G' | 'F' | 'C' | null {
  if (fa.posNum != null) return fa.posNum < 2.5 ? 'G' : fa.posNum < 4.3 ? 'F' : 'C';
  const p = (fa.pos ?? '').toUpperCase();
  if (!p) return null;
  if (p.includes('C')) return 'C';
  if (p.includes('F')) return 'F';
  if (p.includes('G')) return 'G';
  return null;
}

const MIN_SALARY = 2_296_274; // 2026-27 minimum (approx, vet)
const ROSTER_MIN_FOR_CAP = 12; // cap-space teams charge empty slots up to 12

export function SigningExplorer({
  onSignAndTrade,
}: {
  onSignAndTrade?: (acquiring: string, rights: string, faName: string) => void;
} = {}) {
  const teams = useTeams();
  // Default to the team last selected in Team Explorer; keep the shared
  // selection in sync when the user picks a different team here.
  const [abbr, setAbbr] = useState(getSelectedTeam);
  const [selectedFA, setSelectedFA] = useState<string | null>(null);
  const [renounced, setRenounced] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState<PosGroup>('all');

  const team = teams.find((t) => t.abbreviation === abbr) ?? teams[0];
  const cap = getSeasonCap(CURRENT_SEASON);
  const holds = SEEDED_CAP_HOLDS[abbr] ?? [];

  const changeTeam = (a: string) => {
    setAbbr(a);
    setSelectedTeam(a);
    setRenounced(new Set());
    setSelectedFA(null);
  };

  // Cap-room math for a given set of renounced holds.
  const computeRoom = (renouncedSet: Set<string>) => {
    const salary = teamSalaryForSeason(team, CURRENT_SEASON);
    const kept = holds.filter((h) => !renouncedSet.has(h.player));
    const holdsTotal = kept.reduce((s, h) => s + h.amount, 0);
    const rostered = rosteredCount(team, CURRENT_SEASON);
    const emptySlots = Math.max(0, ROSTER_MIN_FOR_CAP - rostered - kept.length);
    const rosterCharge = emptySlots * MIN_FILL_SALARY;
    const capNumber = salary + holdsTotal + rosterCharge;
    return { salary, holdsTotal, rosterCharge, capNumber, space: cap.salaryCap - capNumber };
  };
  const room = useMemo(
    () => computeRoom(renounced),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team, holds, renounced, cap.salaryCap]
  );
  // Room now (all holds kept) vs. the most a team could open by renouncing all.
  const roomBefore = useMemo(
    () => computeRoom(new Set<string>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team, holds, cap.salaryCap]
  );
  const roomAfterAll = useMemo(
    () => computeRoom(new Set(holds.map((h) => h.player))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team, holds, cap.salaryCap]
  );

  const tier = summarizeTeamSeason(team, CURRENT_SEASON).tier;
  // A team whose committed salary is under the cap operates as a cap-space team
  // (renounce holds to open room); otherwise it's an over-cap team (exceptions).
  const capSpaceTeam = room.salary < cap.salaryCap;

  // Composition note describes the baseline (before any renouncements).
  const capNote =
    `${money(roomBefore.salary)} salary + ${money(roomBefore.holdsTotal)} holds` +
    (roomBefore.rosterCharge > 0 ? ` + ${money(roomBefore.rosterCharge)} charges` : '') +
    ` = ${money(roomBefore.capNumber)} vs ${money(cap.salaryCap)} cap · ${TIER_INFO[tier].label}`;

  const fa = FA_POOL.find((f) => f.key === selectedFA) ?? null;

  // Win-now impact of signing the selected FA at his projected contract.
  const signImpact = useMemo(() => {
    if (!fa) return null;
    const signed = buildSignedPlayer(fa.name);
    const after = signed ? [...team.players, signed] : team.players;
    const pre = room.salary;
    return moveImpact(abbr, pre, pre + fa.projected * 1_000_000, after);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fa, abbr, team]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FA_POOL.filter(
      (f) =>
        (!q || f.name.toLowerCase().includes(q)) &&
        (posFilter === 'all' || posGroup(f) === posFilter)
    ).slice(0, 60);
  }, [query, posFilter]);

  return (
    <div className="signing-explorer">
      <div className="se-head">
        <div>
          <span className="cs-kicker">Signing Explorer</span>
          <h2 className="se-title">Model a free-agent signing</h2>
          <span className="se-sub">
            {FA_POOL.length} free agents · projected contract from a market model
            (n={CONTRACT_MODEL_INFO.n} deals, R²={CONTRACT_MODEL_INFO.r2.toFixed(2)}) vs DARKO value
          </span>
        </div>
        <label className="se-team">
          <span>Signing team</span>
          <select value={abbr} onChange={(e) => changeTeam(e.target.value)}>
            {teams.map((t) => (
              <option key={t.abbreviation} value={t.abbreviation}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Team's signing tools + cap room before/after renouncing holds. */}
      <div className="se-quiver-panel">
        <FreeAgentQuiver
          team={team}
          capRoom={{ before: roomBefore.space, after: roomAfterAll.space, note: capNote }}
        />
      </div>

      <div className="se-grid">
        {/* FA list */}
        <div className="se-list">
          <div className="se-list-head">
            <span>Free Agents</span>
            <div className="se-list-controls">
              <select
                className="se-posfilter"
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value as PosGroup)}
              >
                <option value="all">All positions</option>
                <option value="G">Guards</option>
                <option value="F">Forwards</option>
                <option value="C">Centers</option>
              </select>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="se-table-wrap">
            <table className="se-table">
              <thead>
                <tr>
                  <th className="se-name">Player</th>
                  <th>Pos</th>
                  <th>Age</th>
                  <th title="Projected annual contract (market model)">Proj $</th>
                  <th title="DARKO fair-value benchmark">Value</th>
                  <th title="DARKO value − projected contract (bargain vs overpay)">Qual</th>
                  <th>Rights</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr
                    key={f.key}
                    className={`se-row${selectedFA === f.key ? ' se-sel' : ''}`}
                    onClick={() => setSelectedFA(f.key)}
                  >
                    <td className="se-name">{f.name}</td>
                    <td className="se-pos">{f.pos ?? '—'}</td>
                    <td>{f.age ?? '—'}</td>
                    <td className="se-projsal">${f.projected.toFixed(1)}M</td>
                    <td className="se-val">${f.value.toFixed(1)}M</td>
                    <td className={quality(f) >= 0 ? 'se-pos' : 'se-neg'}>
                      {quality(f) >= 0 ? '+' : '−'}${Math.abs(quality(f)).toFixed(1)}M
                    </td>
                    <td>
                      {f.rights ? (
                        <span className={`se-rights${f.rights === abbr ? ' se-rights-own' : ''}`}>
                          {f.rights}
                        </span>
                      ) : (
                        <span className="se-open">open</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Signing analysis */}
        <div className="se-analysis">
          {!fa ? (
            <div className="se-empty">Select a free agent to model the signing.</div>
          ) : (
            <SigningAnalysis
              fa={fa}
              abbr={abbr}
              room={room.space}
              tier={tier}
              capSpaceTeam={capSpaceTeam}
              cap={cap}
              holds={holds}
              renounced={renounced}
              impact={signImpact}
              onSignAndTrade={onSignAndTrade}
              onToggleRenounce={(name) =>
                setRenounced((prev) => {
                  const next = new Set(prev);
                  next.has(name) ? next.delete(name) : next.add(name);
                  return next;
                })
              }
            />
          )}
        </div>
      </div>
      <p className="se-foot">
        Projected contract is a ridge regression fit on {CONTRACT_MODEL_INFO.n} real veteran deals
        (DARKO value + age → salary, clamped to the min and an age-based max), refit as rosters
        update; DARKO value is the analytical fair-value benchmark. Signing quality = value −
        projected. Cap room = cap − salary − unrenounced holds − roster charges. A planning model.
      </p>
    </div>
  );
}

function SigningAnalysis({
  fa,
  abbr,
  room,
  tier,
  capSpaceTeam,
  cap,
  holds,
  renounced,
  impact,
  onToggleRenounce,
  onSignAndTrade,
}: {
  fa: FA;
  abbr: string;
  room: number;
  tier: string;
  capSpaceTeam: boolean;
  cap: ReturnType<typeof getSeasonCap>;
  holds: { player: string; amount: number; type: string }[];
  renounced: Set<string>;
  impact: import('../lib/moveImpact').MoveImpact | null;
  onToggleRenounce: (name: string) => void;
  onSignAndTrade?: (acquiring: string, rights: string, faName: string) => void;
}) {
  const target = fa.projected * 1_000_000; // projected contract (cost) in $
  const surplus = fa.value - fa.projected; // DARKO value − projected pay
  const qualLabel = surplus > 4 ? 'Bargain' : surplus < -4 ? 'Overpay' : 'Fair value';
  const ownRights = fa.rights === abbr;

  // Cap-space teams sign with room (no MLE/BAE); over-cap teams use exceptions.
  const mleAmount =
    tier === 'secondApron' ? 0 : tier === 'firstApron' ? cap.taxpayerMLE : cap.nonTaxpayerMLE;
  const baeAvail = tier === 'overCap' || tier === 'overTax';

  const routes: { label: string; ok: boolean; detail: string }[] = [];
  if (ownRights)
    routes.push({
      label: 'Bird rights',
      ok: true,
      detail: `You hold ${fa.name}'s rights — re-sign over the cap up to his max, no room needed.`,
    });
  if (capSpaceTeam) {
    routes.push({
      label: 'Cap space',
      ok: room >= target,
      detail:
        room >= target
          ? `${money(room)} in room covers the ${money(target)} salary.`
          : `Need ${money(target - room)} more room — renounce holds below.`,
    });
  } else {
    if (mleAmount > 0)
      routes.push({
        label: tier === 'firstApron' ? 'Taxpayer MLE' : 'Non-taxpayer MLE',
        ok: mleAmount >= target,
        detail:
          mleAmount >= target
            ? `The ${money(mleAmount)} MLE covers it.`
            : `MLE (${money(mleAmount)}) is short of ${money(target)}.`,
      });
    if (baeAvail)
      routes.push({
        label: 'Bi-annual exception',
        ok: cap.biAnnualException >= target,
        detail:
          cap.biAnnualException >= target
            ? `The ${money(cap.biAnnualException)} BAE covers it.`
            : `BAE (${money(cap.biAnnualException)}) is short.`,
      });
  }
  routes.push({
    label: 'Minimum',
    ok: true,
    detail: `Always available; a minimum deal (~${money(MIN_SALARY)}) if he'll take it.`,
  });

  const best = routes.find((r) => r.ok && r.label !== 'Minimum');
  const verdict = ownRights
    ? `Re-sign ${fa.name} using his Bird rights.`
    : best
      ? `Can sign via ${best.label}.`
      : room >= target
        ? 'Can sign with cap space.'
        : `No exception covers ${money(target)} — open cap room (renounce holds) or sign for less.`;

  return (
    <div className="se-analysisbox">
      <div className="se-fa-head">
        <div>
          <span className="se-fa-name">{fa.name}</span>
          <span className="se-fa-meta">
            {fa.pos ? `${fa.pos} · ` : ''}
            {fa.age ?? '—'} yo · DPM {fa.dpm == null ? '—' : fa.dpm.toFixed(1)}
            {fa.rights && ` · rights: ${fa.rights}`}
          </span>
        </div>
        <div className="se-fa-sal">
          <span className="se-fa-sal-val">${fa.projected.toFixed(1)}M</span>
          <span className="se-fa-sal-label">projected contract / yr</span>
        </div>
      </div>

      <div className="se-quality">
        <div className="se-quality-fig">
          <span className="se-q-label">DARKO value</span>
          <span className="se-q-val">${fa.value.toFixed(1)}M</span>
        </div>
        <span className="se-q-op">−</span>
        <div className="se-quality-fig">
          <span className="se-q-label">Proj contract</span>
          <span className="se-q-val">${fa.projected.toFixed(1)}M</span>
        </div>
        <span className="se-q-op">=</span>
        <div className="se-quality-fig">
          <span className="se-q-label">Signing quality</span>
          <span className={`se-q-val ${surplus >= 0 ? 'se-pos' : 'se-neg'}`}>
            {surplus >= 0 ? '+' : '−'}${Math.abs(surplus).toFixed(1)}M
          </span>
        </div>
        <span className={`se-q-badge ${surplus > 4 ? 'se-q-bargain' : surplus < -4 ? 'se-q-overpay' : 'se-q-fair'}`}>
          {qualLabel}
        </span>
      </div>

      <div className={`se-verdict ${ownRights || best || room >= target ? 'se-verdict-ok' : 'se-verdict-no'}`}>
        {verdict}
      </div>

      {!ownRights && !best && room < target && fa.rights && fa.rights !== abbr && onSignAndTrade && (
        <button className="se-st-link" onClick={() => onSignAndTrade(abbr, fa.rights!, fa.name)}>
          Can’t sign outright — <strong>sign &amp; trade</strong> with {fa.rights} (holds his rights)
          to land {fa.name} →
        </button>
      )}

      <div className="se-routes">
        {routes.map((r) => (
          <div key={r.label} className={`se-route ${r.ok ? 'se-route-ok' : 'se-route-no'}`}>
            <span className="se-route-mark">{r.ok ? '✓' : '✕'}</span>
            <span className="se-route-label">{r.label}</span>
            <span className="se-route-detail">{r.detail}</span>
          </div>
        ))}
      </div>

      {impact && <MoveImpactView impact={impact} />}

      {!ownRights && capSpaceTeam && holds.length > 0 && (
        <div className="se-renounce">
          <span className="se-renounce-head">
            Renounce holds to open cap room {room < target && '(needed for the cap-space route)'}
          </span>
          <div className="se-renounce-list">
            {holds.map((h) => (
              <label key={h.player} className={`se-renounce-item${renounced.has(h.player) ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={renounced.has(h.player)}
                  onChange={() => onToggleRenounce(h.player)}
                />
                <span className="se-renounce-name">{h.player}</span>
                <span className="se-renounce-amt">{money(h.amount)}</span>
              </label>
            ))}
          </div>
          <p className="se-renounce-note">
            Renouncing a free agent frees his hold from your cap but forfeits the right to re-sign
            him over the cap.
          </p>
        </div>
      )}
    </div>
  );
}
