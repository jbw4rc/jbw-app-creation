import { useMemo, useState } from 'react';
import { CURRENT_SEASON, getSeasonCap } from '../data/leagueConstants';
import { SEEDED_DARKO } from '../data/seededDarko';
import { SEEDED_CAP_HOLDS } from '../data/seededCapHolds';
import { TEAMS } from '../data/teams';
import { useTeams } from '../lib/teamStore';
import {
  MIN_FILL_SALARY,
  rosteredCount,
  summarizeTeamSeason,
  teamSalaryForSeason,
  TIER_INFO,
} from '../lib/apron';
import { money } from '../lib/format';
import { FreeAgentQuiver } from './FreeAgentQuiver';

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
  value: number; // projected salary, $M (DARKO market value)
  dpm: number | null;
  age: number | null;
  rights: string | null; // team abbr holding Bird rights, if any
}

const FA_POOL: FA[] = Object.entries(SEEDED_DARKO)
  .filter(([key]) => !ROSTERED.has(key))
  .map(([key, d]) => ({
    name: d.name,
    key,
    value: d.value ?? 0,
    dpm: d.dpm ?? null,
    age: d.age ?? null,
    rights: RIGHTS[key] ?? null,
  }))
  .sort((a, b) => b.value - a.value);

const MIN_SALARY = 2_296_274; // 2026-27 minimum (approx, vet)
const ROSTER_MIN_FOR_CAP = 12; // cap-space teams charge empty slots up to 12

export function SigningExplorer() {
  const teams = useTeams();
  const [abbr, setAbbr] = useState('BKN');
  const [selectedFA, setSelectedFA] = useState<string | null>(null);
  const [renounced, setRenounced] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const team = teams.find((t) => t.abbreviation === abbr) ?? teams[0];
  const cap = getSeasonCap(CURRENT_SEASON);
  const holds = SEEDED_CAP_HOLDS[abbr] ?? [];

  const changeTeam = (a: string) => {
    setAbbr(a);
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
  const roomBefore = useMemo(
    () => computeRoom(new Set<string>()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [team, holds, cap.salaryCap]
  );

  const tier = summarizeTeamSeason(team, CURRENT_SEASON).tier;
  // A team whose committed salary is under the cap operates as a cap-space team
  // (renounce holds to open room); otherwise it's an over-cap team (exceptions).
  const capSpaceTeam = room.salary < cap.salaryCap;

  const capNote =
    `${money(room.salary)} salary + ${money(room.holdsTotal)} holds` +
    (room.rosterCharge > 0 ? ` + ${money(room.rosterCharge)} charges` : '') +
    ` = ${money(room.capNumber)} vs ${money(cap.salaryCap)} cap · ${TIER_INFO[tier].label}`;

  const fa = FA_POOL.find((f) => f.key === selectedFA) ?? null;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FA_POOL.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 60);
  }, [query]);

  return (
    <div className="signing-explorer">
      <div className="se-head">
        <div>
          <span className="cs-kicker">Signing Explorer</span>
          <h2 className="se-title">Model a free-agent signing</h2>
          <span className="se-sub">
            {FA_POOL.length} free agents · projected salary = DARKO market value
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
          capRoom={{ before: roomBefore.space, after: room.space, note: capNote }}
        />
      </div>

      <div className="se-grid">
        {/* FA list */}
        <div className="se-list">
          <div className="se-list-head">
            <span>Free Agents</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              spellCheck={false}
            />
          </div>
          <div className="se-table-wrap">
            <table className="se-table">
              <thead>
                <tr>
                  <th className="se-name">Player</th>
                  <th>Age</th>
                  <th title="Projected salary = DARKO market value">Proj $</th>
                  <th title="DARKO Daily Plus-Minus">DPM</th>
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
                    <td>{f.age ?? '—'}</td>
                    <td className="se-projsal">${f.value.toFixed(1)}M</td>
                    <td className={f.dpm == null ? '' : f.dpm >= 0 ? 'se-pos' : 'se-neg'}>
                      {f.dpm == null ? '—' : `${f.dpm > 0 ? '+' : ''}${f.dpm.toFixed(1)}`}
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
        Projected salary is DARKO's market value; cap room = cap − salary − unrenounced holds −
        roster charges. Exception amounts are the 2026-27 CBA figures. A simplified planning model.
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
  onToggleRenounce,
}: {
  fa: FA;
  abbr: string;
  room: number;
  tier: string;
  capSpaceTeam: boolean;
  cap: ReturnType<typeof getSeasonCap>;
  holds: { player: string; amount: number; type: string }[];
  renounced: Set<string>;
  onToggleRenounce: (name: string) => void;
}) {
  const target = fa.value * 1_000_000; // projected salary in $
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
            {fa.age ?? '—'} yo · DPM {fa.dpm == null ? '—' : fa.dpm.toFixed(1)}
            {fa.rights && ` · rights: ${fa.rights}`}
          </span>
        </div>
        <div className="se-fa-sal">
          <span className="se-fa-sal-val">${fa.value.toFixed(1)}M</span>
          <span className="se-fa-sal-label">projected salary</span>
        </div>
      </div>

      <div className={`se-verdict ${ownRights || best || room >= target ? 'se-verdict-ok' : 'se-verdict-no'}`}>
        {verdict}
      </div>

      <div className="se-routes">
        {routes.map((r) => (
          <div key={r.label} className={`se-route ${r.ok ? 'se-route-ok' : 'se-route-no'}`}>
            <span className="se-route-mark">{r.ok ? '✓' : '✕'}</span>
            <span className="se-route-label">{r.label}</span>
            <span className="se-route-detail">{r.detail}</span>
          </div>
        ))}
      </div>

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
