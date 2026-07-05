import { useEffect, useMemo, useState } from 'react';
import type { DraftPick, Player, Team } from '../types';
import type { TradeSetup } from '../App';
import { useTeams, getTeams, getSelectedTeam, commitSessionMove } from '../lib/teamStore';
import { CURRENT_SEASON } from '../data/leagueConstants';
import {
  frozenPickYear,
  playerSalaryForSeason,
  summarizeSeason,
  summarizeTeamSeason,
  TIER_INFO,
} from '../lib/apron';
import {
  evaluateMultiTeamTrade,
  type SelectedTpe,
  type TeamTradeResult,
} from '../lib/trade';
import {
  tradeExceptionsFor,
  useTradeExceptions,
  type TradeException,
} from '../lib/tradeExceptionsStore';
import { darkoFor } from '../lib/darko';
import { contractTerm } from '../lib/contract';
import { AGING_PEAK_AGE } from '../data/agingCurve';
import { buildSignedPlayer, signableHolds, stId } from '../lib/signAndTrade';
import { gradeTrade, type AssetValue, type SideGrade, type TradeGrade } from '../lib/tradeGrade';
import { moveImpact, type MoveImpact } from '../lib/moveImpact';
import { USING_TANKATHON } from '../lib/draftValue';
import { MoveImpactView } from './MoveImpactView';
import { money } from '../lib/format';
import { ApronMeter } from './ApronMeter';

const dpmFmt = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}`;

// The current league year begins ~July 1 of the focal season. A TPE created
// before then is a "prior-year" exception, frozen for second-apron teams.
const LEAGUE_YEAR_START = new Date(`${CURRENT_SEASON}-07-01T00:00:00`);

function toSelectedTpe(te: TradeException): SelectedTpe {
  const start = te.start ? new Date(te.start) : null;
  const priorYear = Boolean(start && !Number.isNaN(start.getTime()) && start < LEAGUE_YEAR_START);
  return { player: te.player, remaining: te.remaining, expired: te.expired, priorYear };
}

// The NBA league year that a TPE was created in (starts ~July 1), e.g. a
// Feb-2026 exception belongs to the 2025-26 league year → "'25-26".
function leagueYearLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `'${String(s).slice(2)}-${String(s + 1).slice(2)}`;
}

// The Trade Machine: build a trade among 2–4 teams, route each outgoing asset
// to a destination, and see the legality verdict, the grade, and a before/after
// apron read for every team.

const MAX_TEAMS = 4;

interface Slot {
  abbr: string;
  players: string[]; // outgoing roster player ids
  st: string[]; // free agents (by name) signed-and-traded from this team's holds
  playerDest: Record<string, string>; // player/S&T id -> destination abbr (3+ teams)
  picks: number[]; // draftCapital indices
  pickDest: Record<number, string>;
  tpe: number | null;
}

const emptySlot = (abbr: string): Slot => ({
  abbr,
  players: [],
  st: [],
  playerDest: {},
  picks: [],
  pickDest: {},
  tpe: null,
});

// A team augmented with the synthetic players it is signing-and-trading, so the
// engine can resolve them as outgoing assets and count their salary.
function effectiveTeam(slot: Slot, team: Team): Team {
  if (!slot.st.length) return team;
  const signed = slot.st.map(buildSignedPlayer).filter((p): p is Player => p != null);
  return { ...team, players: [...team.players, ...signed] };
}

export function TradeMachine({
  setup,
  onConsumeSetup,
}: {
  setup?: TradeSetup | null;
  onConsumeSetup?: () => void;
} = {}) {
  // First slot defaults to the team last selected in Team Explorer; the second
  // to any other team so the machine doesn't open with a team trading itself.
  const [slots, setSlots] = useState<Slot[]>(() => {
    const first = getSelectedTeam();
    const second = getTeams().find((t) => t.abbreviation !== first)?.abbreviation ?? first;
    return [emptySlot(first), emptySlot(second)];
  });
  const teams = useTeams();
  useTradeExceptions(); // re-render when the imported TPE set changes

  // A sign-and-trade launched from the Signings tab: acquiring team + the rights
  // team signing-and-trading the free agent to it.
  useEffect(() => {
    if (!setup) return;
    setSlots([emptySlot(setup.acquiring), { ...emptySlot(setup.rights), st: [setup.faName] }]);
    onConsumeSetup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);

  const teamOf = (abbr: string): Team => teams.find((t) => t.abbreviation === abbr) ?? teams[0];
  const multi = slots.length > 2;

  const otherAbbrs = (i: number) => slots.filter((_, j) => j !== i).map((s) => s.abbr);
  // Default destination is the next team in the ring (0→1→2→0), a balanced
  // starting point; with two teams that's simply the other side.
  const nextAbbr = (i: number) => slots[(i + 1) % slots.length].abbr;
  const effPlayerDest = (i: number, id: string) =>
    slots.length === 2 ? nextAbbr(i) : slots[i].playerDest[id] ?? nextAbbr(i);
  const effPickDest = (i: number, idx: number) =>
    slots.length === 2 ? nextAbbr(i) : slots[i].pickDest[idx] ?? nextAbbr(i);

  const evaluation = useMemo(() => {
    const sides = slots.map((s, i) => {
      const team = effectiveTeam(s, teamOf(s.abbr));
      const outgoingPicks = s.picks.map((idx) => team.draftCapital[idx]).filter(Boolean);
      const pickDest = s.picks.map((idx) => effPickDest(i, idx));
      const outgoingPlayerIds = [...s.players, ...s.st.map(stId)];
      const playerDest: Record<string, string> = {};
      outgoingPlayerIds.forEach((id) => (playerDest[id] = effPlayerDest(i, id)));
      const te = s.tpe != null ? tradeExceptionsFor(s.abbr)[s.tpe] : undefined;
      return {
        team,
        outgoingPlayerIds,
        outgoingPicks,
        pickDest,
        playerDest,
        tpe: te ? toSelectedTpe(te) : undefined,
      };
    });
    return evaluateMultiTeamTrade(sides, CURRENT_SEASON);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, teams]);

  const grade = useMemo(() => gradeTrade(evaluation.teams), [evaluation]);

  // Per-team win-now impact: talent/rank shift, status flip, true cost.
  const impacts = useMemo(
    () =>
      evaluation.teams.map((r, i) => {
        const base = teamOf(slots[i].abbr);
        const outIds = new Set(r.outgoingPlayers.map((p) => p.id));
        const after = [...base.players.filter((p) => !outIds.has(p.id)), ...r.incomingPlayers];
        return moveImpact(slots[i].abbr, r.preSalary, r.postSalary, after);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [evaluation]
  );

  // Commit the (legal) trade to the GM session: apply each team's post-trade
  // roster, log the move, and reset the machine for the next deal.
  const commitTrade = () => {
    if (!evaluation.legal || !hasAssets) return;
    const rosterChanges: Record<string, Player[]> = {};
    evaluation.teams.forEach((r, i) => {
      const abbr = slots[i].abbr;
      const outIds = new Set(r.outgoingPlayers.map((p) => p.id));
      rosterChanges[abbr] = [
        ...teamOf(abbr).players.filter((p) => !outIds.has(p.id)),
        ...r.incomingPlayers,
      ];
    });
    const summary = evaluation.teams
      .map((r, i) => `${slots[i].abbr} ← ${r.incomingPlayers.map((p) => p.name).join(', ') || '—'}`)
      .join(' · ');
    commitSessionMove(
      rosterChanges,
      { kind: 'trade', summary, teams: slots.map((s) => s.abbr) },
      getSelectedTeam()
    );
    const first = getSelectedTeam();
    const second = getTeams().find((t) => t.abbreviation !== first)?.abbreviation ?? first;
    setSlots([emptySlot(first), emptySlot(second)]);
  };

  const setSlot = (i: number, patch: Partial<Slot>) =>
    setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const togglePlayer = (i: number, id: string) =>
    setSlots((prev) =>
      prev.map((s, j) =>
        j !== i
          ? s
          : {
              ...s,
              players: s.players.includes(id)
                ? s.players.filter((x) => x !== id)
                : [...s.players, id],
            }
      )
    );
  const togglePick = (i: number, idx: number) =>
    setSlots((prev) =>
      prev.map((s, j) =>
        j !== i
          ? s
          : { ...s, picks: s.picks.includes(idx) ? s.picks.filter((x) => x !== idx) : [...s.picks, idx] }
      )
    );
  const toggleST = (i: number, name: string) =>
    setSlots((prev) =>
      prev.map((s, j) =>
        j !== i
          ? s
          : { ...s, st: s.st.includes(name) ? s.st.filter((x) => x !== name) : [...s.st, name] }
      )
    );
  const toggleTpe = (i: number, idx: number) => setSlot(i, { tpe: slots[i].tpe === idx ? null : idx });
  const setPlayerDest = (i: number, id: string, d: string) =>
    setSlot(i, { playerDest: { ...slots[i].playerDest, [id]: d } });
  const setPickDest = (i: number, idx: number, d: string) =>
    setSlot(i, { pickDest: { ...slots[i].pickDest, [idx]: d } });
  const changeTeam = (i: number, abbr: string) =>
    setSlot(i, { abbr, players: [], st: [], playerDest: {}, picks: [], pickDest: {}, tpe: null });

  const addTeam = () =>
    setSlots((prev) => {
      if (prev.length >= MAX_TEAMS) return prev;
      const used = new Set(prev.map((s) => s.abbr));
      const next = teams.find((t) => !used.has(t.abbreviation));
      return next ? [...prev, emptySlot(next.abbreviation)] : prev;
    });
  const removeTeam = (i: number) =>
    setSlots((prev) => (prev.length <= 2 ? prev : prev.filter((_, j) => j !== i)));

  const hasSelection = slots.some(
    (s) => s.players.length || s.st.length || s.picks.length || s.tpe != null
  );
  const hasAssets = slots.some((s) => s.players.length || s.st.length || s.picks.length);

  return (
    <div className="trade-machine">
      <div className="trade-teambar">
        <span className="tt-count">{slots.length}-team trade</span>
        <button className="tt-add" onClick={addTeam} disabled={slots.length >= MAX_TEAMS}>
          + Add team
        </button>
        {multi && <span className="tt-hint">Route each asset with the “send to” pickers.</span>}
      </div>

      <div className="verdict-bar">
        {!hasSelection ? (
          <div className="verdict verdict-idle">
            Select players from each team to build a trade.
          </div>
        ) : evaluation.legal ? (
          <div className="verdict verdict-legal">
            <span className="verdict-icon">✓</span> Trade is legal
            {evaluation.teams.some((t) => t.violations.some((v) => v.severity === 'warn')) &&
              ' — with cautions'}
          </div>
        ) : (
          <div className="verdict verdict-illegal">
            <span className="verdict-icon">✕</span> Trade is blocked —{' '}
            {evaluation.blockingViolations.length} rule
            {evaluation.blockingViolations.length > 1 ? 's' : ''} violated
          </div>
        )}
      </div>

      {hasAssets && <TradeGradePanel grade={grade} impacts={impacts} />}

      {hasAssets && evaluation.legal && (
        <button className="tg-commit" onClick={commitTrade}>
          + Commit trade to My Team session
        </button>
      )}

      <div className={`trade-sides cols-${slots.length}`}>
        {slots.map((s, i) => (
          <TradeColumn
            key={i}
            team={teamOf(s.abbr)}
            multi={multi}
            selected={new Set(s.players)}
            selectedST={new Set(s.st)}
            selectedPicks={new Set(s.picks)}
            selectedTpe={s.tpe}
            playerDestOf={(id) => effPlayerDest(i, id)}
            pickDestOf={(idx) => effPickDest(i, idx)}
            onToggle={(id) => togglePlayer(i, id)}
            onToggleST={(name) => toggleST(i, name)}
            onTogglePick={(idx) => togglePick(i, idx)}
            onToggleTpe={(idx) => toggleTpe(i, idx)}
            onTeamChange={(abbr) => changeTeam(i, abbr)}
            onPlayerDest={(id, d) => setPlayerDest(i, id, d)}
            onPickDest={(idx, d) => setPickDest(i, idx, d)}
            onRemove={slots.length > 2 ? () => removeTeam(i) : undefined}
            usedAbbrs={otherAbbrs(i)}
            result={evaluation.teams[i]}
          />
        ))}
      </div>
    </div>
  );
}

// $M figure with sign, e.g. "+$4.2M" / "−$1.1M".
const netM = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(1)}M`;
const absM = (n: number) => `$${n.toFixed(1)}M`;

// Tooltip: this-year surplus (value − cap hit) plus the multi-year controlled total.
function assetTitle(a: AssetValue): string {
  if (a.kind === 'player') {
    if (a.grossValue == null) return 'No DARKO value — treated as neutral';
    const thisYr = `value ${absM(a.grossValue)} − cap hit ${absM(a.salary ?? 0)} = ${netM(
      a.currentSurplus ?? 0
    )} this yr`;
    const ctrl =
      (a.years ?? 0) > 1
        ? ` · controlled ${a.term} (${a.years}y) → ${netM(a.value)} total`
        : ' · expiring';
    return thisYr + ctrl;
  }
  return a.note ?? '';
}

function gradeClass(grade: string): string {
  const g = grade[0];
  if (g === 'A') return 'grade-a';
  if (g === 'B') return 'grade-b';
  if (g === 'C') return 'grade-c';
  if (g === 'D') return 'grade-d';
  return 'grade-f';
}

// Per-side trade grade: values every asset as SURPLUS (DARKO value − cap hit for
// players, projected value for picks) and scores each team's net haul.
function TradeGradePanel({ grade, impacts }: { grade: TradeGrade; impacts: MoveImpact[] }) {
  return (
    <div className="trade-grade">
      <div className="tg-head">
        <span className="tg-title">Trade Grade</span>
        <span className="tg-basis">
          NPV of age-adjusted value − cap-adjusted salary, over years controlled ·{' '}
          {USING_TANKATHON ? 'picks via Tankathon projected order' : 'picks via DARKO team strength'}
        </span>
      </div>
      <div className="tg-cards">
        {grade.sides.map((s, i) => (
          <SideGradeCard key={s.teamAbbr} side={s} impact={impacts[i]} />
        ))}
      </div>
    </div>
  );
}

// One asset line: name + its signed surplus. Players with a breakdown are
// clickable to expand the per-year "show the math" table.
function AssetRow({
  a,
  isOpen,
  onToggle,
}: {
  a: AssetValue;
  isOpen: boolean;
  onToggle?: () => void;
}) {
  const expandable = Boolean(onToggle);
  return (
    <div
      className={`tg-asset${expandable ? ' tg-expandable' : ''}${isOpen ? ' tg-open' : ''}`}
      title={expandable ? 'Show the math' : assetTitle(a)}
      onClick={onToggle}
    >
      <span className="tg-asset-name">
        {expandable && <span className="tg-caret">{isOpen ? '▾' : '▸'}</span>}
        {a.label}
        {a.kind === 'player' && a.term && <span className="tg-term">{a.term}</span>}
        {a.unmatched && <span className="tg-flag" title="No DARKO value — treated as neutral"> ~</span>}
      </span>
      <span className={`tg-asset-val ${a.value >= 0 ? 'tg-pos' : 'tg-neg'}`}>{netM(a.value)}</span>
    </div>
  );
}

// The per-year value math for one player — DARKO value, salary, surplus, and the
// aging / cap / NPV factors applied to each future season.
function AssetMath({ a }: { a: AssetValue }) {
  const rows = a.breakdown ?? [];
  const yr = (s: number) => `${s}-${String(s + 1).slice(2)}`;
  const hasOption = rows.some((r) => r.effective !== r.surplus);
  return (
    <div className="tg-math">
      <div className="tg-math-head">
        <strong>{a.label}</strong> · DARKO value ${a.grossValue?.toFixed(1)}M → net{' '}
        {netM(a.value)} over {rows.length} controlled {rows.length === 1 ? 'yr' : 'yrs'}
      </div>
      <div className="tg-math-scroll">
        <table className="tg-math-table">
          <thead>
            <tr>
              <th />
              {rows.map((r) => (
                <th key={r.season}>
                  {yr(r.season)}
                  {r.option === 'player' && <span className="tg-opt"> PO</span>}
                  {r.option === 'team' && <span className="tg-opt"> TO</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Aging ×</th>
              {rows.map((r) => <td key={r.season}>{r.retention.toFixed(3)}</td>)}
            </tr>
            <tr>
              <th>DARKO value (aged)</th>
              {rows.map((r) => <td key={r.season}>${r.agedValue.toFixed(1)}M</td>)}
            </tr>
            <tr>
              <th>Salary (nominal)</th>
              {rows.map((r) => <td key={r.season}>${r.salaryNominal.toFixed(1)}M</td>)}
            </tr>
            <tr>
              <th>Cap growth ×</th>
              {rows.map((r) => <td key={r.season}>{r.capGrowth.toFixed(2)}</td>)}
            </tr>
            <tr>
              <th>Salary (today's $)</th>
              {rows.map((r) => <td key={r.season}>${r.salaryReal.toFixed(1)}M</td>)}
            </tr>
            <tr className="tg-math-surplus">
              <th>Surplus</th>
              {rows.map((r) => (
                <td key={r.season} className={r.surplus >= 0 ? 'tg-pos' : 'tg-neg'}>
                  {netM(r.surplus)}
                </td>
              ))}
            </tr>
            {hasOption && (
              <tr>
                <th>Option adj</th>
                {rows.map((r) => (
                  <td key={r.season}>
                    {r.effective !== r.surplus ? netM(r.effective) : '—'}
                  </td>
                ))}
              </tr>
            )}
            <tr>
              <th>NPV ×</th>
              {rows.map((r) => <td key={r.season}>{r.npv.toFixed(2)}</td>)}
            </tr>
            <tr className="tg-math-contrib">
              <th>Contribution</th>
              {rows.map((r) => (
                <td key={r.season} className={r.contribution >= 0 ? 'tg-pos' : 'tg-neg'}>
                  {netM(r.contribution)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="tg-math-note">
        Aging × is the empirical DARKO curve (peak age {AGING_PEAK_AGE}): &gt;1 =
        projected development for a pre-peak player, &lt;1 = decline. Cap growth ×
        deflates future salaries to today's dollars; NPV × discounts future years.
      </div>
    </div>
  );
}

function SideGradeCard({ side, impact }: { side: SideGrade; impact?: MoveImpact }) {
  const [open, setOpen] = useState<string | null>(null);
  const canExpand = (a: AssetValue) => a.kind === 'player' && (a.breakdown?.length ?? 0) > 0;
  const openAsset = [...side.assetsIn, ...side.assetsOut].find(
    (a) => a.label === open && canExpand(a)
  );
  const toggle = (a: AssetValue) => setOpen((o) => (o === a.label ? null : a.label));

  const renderCol = (assets: AssetValue[], head: string, total: number) => (
    <div className="tg-col">
      <span className="tg-col-head">
        {head} · {netM(total)}
      </span>
      {assets.length ? (
        assets.map((a, i) => (
          <AssetRow
            key={i}
            a={a}
            isOpen={open === a.label && canExpand(a)}
            onToggle={canExpand(a) ? () => toggle(a) : undefined}
          />
        ))
      ) : (
        <div className="tg-asset tg-empty">—</div>
      )}
    </div>
  );

  return (
    <div className="tg-card">
      <div className="tg-card-top">
        <span className="tg-team">{side.teamAbbr}</span>
        <span className={`tg-letter ${gradeClass(side.grade)}`}>{side.grade}</span>
      </div>
      <div className="tg-net">
        <span className={side.netValue >= 0 ? 'tg-pos' : 'tg-neg'}>
          {netM(side.netValue)}
        </span>
        <span className="tg-net-label">net surplus</span>
        <span className={`tg-dpm ${side.netDpm >= 0 ? 'tg-pos' : 'tg-neg'}`}>
          {side.netDpm >= 0 ? '+' : '−'}
          {Math.abs(side.netDpm).toFixed(1)} DPM
        </span>
      </div>
      <div className="tg-ledger">
        {renderCol(side.assetsIn, 'Gets', side.valueIn)}
        {renderCol(side.assetsOut, 'Sends', side.valueOut)}
      </div>
      {openAsset && <AssetMath a={openAsset} />}
      {impact && <MoveImpactView impact={impact} />}
      <div className="tg-note tg-hint">Click a player to show the year-by-year math.</div>
      {side.approximate && (
        <div className="tg-note">~ = player without a DARKO value; treated as neutral.</div>
      )}
    </div>
  );
}

interface ColumnProps {
  team: Team;
  multi: boolean;
  selected: Set<string>;
  selectedST: Set<string>;
  selectedPicks: Set<number>;
  selectedTpe: number | null;
  playerDestOf: (id: string) => string;
  pickDestOf: (index: number) => string;
  onToggle: (id: string) => void;
  onToggleST: (name: string) => void;
  onTogglePick: (index: number) => void;
  onToggleTpe: (index: number) => void;
  onTeamChange: (abbr: string) => void;
  onPlayerDest: (id: string, dest: string) => void;
  onPickDest: (index: number, dest: string) => void;
  onRemove?: () => void;
  /** Abbreviations used by the OTHER teams in the trade. */
  usedAbbrs: string[];
  result: TeamTradeResult;
}

function TradeColumn({
  team,
  multi,
  selected,
  selectedST,
  selectedPicks,
  selectedTpe,
  playerDestOf,
  pickDestOf,
  onToggle,
  onToggleST,
  onTogglePick,
  onToggleTpe,
  onTeamChange,
  onPlayerDest,
  onPickDest,
  onRemove,
  usedAbbrs,
  result,
}: ColumnProps) {
  const teams = useTeams();
  const signable = signableHolds(team.abbreviation);
  const preSummary = summarizeSeason(result.preSalary, CURRENT_SEASON);
  const postSummary = summarizeSeason(result.postSalary, CURRENT_SEASON);

  // Second-apron teams cannot trade the first-round pick seven drafts out.
  const inSecondApron =
    summarizeTeamSeason(team, CURRENT_SEASON).tier === 'secondApron';
  const frozenYear = frozenPickYear(CURRENT_SEASON);
  const tpes = tradeExceptionsFor(team.abbreviation);

  const sorted = [...team.players].sort(
    (a, b) =>
      playerSalaryForSeason(b, CURRENT_SEASON) -
      playerSalaryForSeason(a, CURRENT_SEASON)
  );

  const used = new Set(usedAbbrs);
  return (
    <div className="trade-column">
      <div className="trade-column-top">
        <select
          className="trade-team-select"
          value={team.abbreviation}
          onChange={(e) => onTeamChange(e.target.value)}
        >
          {teams.map((t) => (
            <option
              key={t.abbreviation}
              value={t.abbreviation}
              disabled={used.has(t.abbreviation)}
            >
              {t.name}
            </option>
          ))}
        </select>
        {onRemove && (
          <button className="trade-remove" onClick={onRemove} title="Remove team from trade">
            ×
          </button>
        )}
      </div>

      <div className="trade-roster-head">
        <span />
        <span className="rh-name">Player</span>
        <span title="DARKO Daily Plus-Minus">DPM</span>
        <span title="DARKO market value">Value</span>
        <span>Cap Hit</span>
      </div>
      <div className="trade-roster">
        {sorted.map((p) => (
          <PlayerRow
            key={p.id}
            player={p}
            selected={selected.has(p.id)}
            onToggle={() => onToggle(p.id)}
          />
        ))}
      </div>

      <div className="trade-picks">
        <span className="trade-picks-head">Draft Capital</span>
        <div className="trade-picks-grid">
          {team.draftCapital.map((pk, i) => {
            const isFrozen =
              inSecondApron &&
              pk.round === 1 &&
              pk.year === frozenYear &&
              pk.originalTeam === team.abbreviation;
            return (
              <button
                key={`${pk.year}-${pk.round}-${pk.originalTeam}-${i}`}
                className={`trade-pick${selectedPicks.has(i) ? ' selected' : ''}${
                  isFrozen ? ' frozen' : ''
                }`}
                onClick={() => onTogglePick(i)}
                title={
                  isFrozen
                    ? 'Frozen in the second apron — including it blocks the trade'
                    : pk.notes ?? ''
                }
              >
                <span className="tp-check">{selectedPicks.has(i) ? '✓' : ''}</span>
                <span className="tpick-year">{pk.year}</span>
                <span className="tpick-round">
                  {pk.round === 1 ? '1st' : '2nd'}
                  {pk.originalTeam !== team.abbreviation && (
                    <span className="draft-via"> · {pk.originalTeam}</span>
                  )}
                </span>
                {isFrozen && <span className="tpick-flag">FROZEN</span>}
              </button>
            );
          })}
        </div>
      </div>

      {tpes.length > 0 && (
        <div className="trade-tpes">
          <span className="trade-tpes-head">Trade Exceptions · absorb salary into</span>
          <div className="trade-tpes-list">
            {tpes.map((te, i) => {
              const sel = toSelectedTpe(te);
              const frozen = inSecondApron && sel.priorYear && !te.expired;
              const lyLabel = te.start ? leagueYearLabel(te.start) : null;
              return (
                <button
                  key={`${te.player}-${i}`}
                  className={`trade-tpe${selectedTpe === i ? ' selected' : ''}${
                    te.expired ? ' expired' : ''
                  }${frozen ? ' frozen' : ''}`}
                  onClick={te.expired ? undefined : () => onToggleTpe(i)}
                  disabled={te.expired}
                  title={
                    te.expired
                      ? 'Expired — no longer usable'
                      : frozen
                        ? `${lyLabel} exception — prior-year TPEs are frozen over the second apron`
                        : `${lyLabel} trade exception · absorb up to ${money(te.remaining)}`
                  }
                >
                  <span className="tp-check">{selectedTpe === i ? '✓' : ''}</span>
                  <span className="ttpe-amt">{money(te.remaining)}</span>
                  {lyLabel && (
                    <span
                      className={`ttpe-year${sel.priorYear ? ' prior' : ''}`}
                      title={sel.priorYear ? 'Prior league year' : 'Current league year'}
                    >
                      {lyLabel}
                    </span>
                  )}
                  <span className="ttpe-player">{te.player}</span>
                  {te.expired && <span className="ttpe-flag">EXPIRED</span>}
                  {frozen && <span className="ttpe-flag">FROZEN</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {signable.length > 0 && (
        <div className="trade-st">
          <span className="trade-st-head">Sign &amp; Trade · from FA holds (projected deal)</span>
          <div className="trade-st-list">
            {signable.map((fa) => (
              <button
                key={fa.name}
                className={`trade-st-item${selectedST.has(fa.name) ? ' selected' : ''}`}
                onClick={() => onToggleST(fa.name)}
                title={`Sign ${fa.name} to a projected ${money(fa.projected * 1_000_000)}/yr deal and trade him`}
              >
                <span className="tp-check">{selectedST.has(fa.name) ? '✓' : ''}</span>
                <span className="st-name">{fa.name}</span>
                {fa.pos && <span className="st-pos">{fa.pos}</span>}
                <span className="st-cost">{money(fa.projected * 1_000_000)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {multi && (selected.size > 0 || selectedST.size > 0 || selectedPicks.size > 0) && (
        <div className="trade-routing">
          <span className="trade-routing-head">Send to</span>
          {[...selected].map((id) => {
            const p = team.players.find((x) => x.id === id);
            return (
              <div key={id} className="route-row">
                <span className="route-name">{p?.name ?? id}</span>
                <span className="route-arrow">→</span>
                <select value={playerDestOf(id)} onChange={(e) => onPlayerDest(id, e.target.value)}>
                  {usedAbbrs.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            );
          })}
          {[...selectedST].map((name) => (
            <div key={`st-${name}`} className="route-row">
              <span className="route-name">
                {name} <span className="st-tag">S&amp;T</span>
              </span>
              <span className="route-arrow">→</span>
              <select
                value={playerDestOf(stId(name))}
                onChange={(e) => onPlayerDest(stId(name), e.target.value)}
              >
                {usedAbbrs.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          ))}
          {[...selectedPicks].map((idx) => {
            const pk = team.draftCapital[idx];
            if (!pk) return null;
            return (
              <div key={`pk-${idx}`} className="route-row">
                <span className="route-name">
                  {pk.year} {pk.round === 1 ? '1st' : '2nd'}
                  {pk.originalTeam !== team.abbreviation ? ` (${pk.originalTeam})` : ''}
                </span>
                <span className="route-arrow">→</span>
                <select value={pickDestOf(idx)} onChange={(e) => onPickDest(idx, e.target.value)}>
                  {usedAbbrs.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <PickFlow result={result} />

      <div className="trade-flow">
        <div className="flow-item">
          <span className="flow-label">Sends out</span>
          <span className="flow-value">{money(result.outgoingSalary)}</span>
        </div>
        <div className="flow-item">
          <span className="flow-label">Takes back</span>
          <span className="flow-value">{money(result.incomingSalary)}</span>
        </div>
        <div className="flow-item">
          <span className="flow-label">Max legal in</span>
          <span
            className={`flow-value ${
              result.incomingSalary > result.maxAllowedIncoming + 1 ? 'flow-bad' : 'flow-ok'
            }`}
          >
            {money(result.maxAllowedIncoming)}
          </span>
          {result.tpeCapacity > 0 && (
            <span className="flow-sub">incl. {money(result.tpeCapacity)} TPE</span>
          )}
        </div>
      </div>

      <div className="trade-beforeafter">
        <div className="ba-block">
          <div className="ba-label">Before</div>
          <ApronMeter summary={preSummary} />
        </div>
        <div className="ba-arrow">→</div>
        <div className="ba-block">
          <div className="ba-label">After</div>
          <ApronMeter summary={postSummary} />
        </div>
      </div>

      <ApronProximity result={result} />

      {result.violations.length > 0 && (
        <ul className="violation-list">
          {result.violations.map((v, i) => (
            <li key={i} className={`violation violation-${v.severity}`}>
              <span className="violation-badge">
                {v.severity === 'block' ? 'BLOCK' : 'CAUTION'}
              </span>
              <div>
                <div className="violation-title">{v.title}</div>
                <div className="violation-detail">{v.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Draft picks leaving and arriving in the deal. Picks do not affect the salary
// math, but the user wants them tracked as part of the package.
function PickFlow({ result }: { result: TeamTradeResult }) {
  if (result.outgoingPicks.length === 0 && result.incomingPicks.length === 0) {
    return null;
  }
  const label = (pk: DraftPick) =>
    `${pk.year} ${pk.round === 1 ? '1st' : '2nd'}${
      pk.originalTeam !== result.teamAbbr ? ` (${pk.originalTeam})` : ''
    }`;
  return (
    <div className="pick-flow">
      <div className="pick-flow-row">
        <span className="pick-flow-label">Picks out</span>
        <span className="pick-flow-value">
          {result.outgoingPicks.length
            ? result.outgoingPicks.map(label).join(', ')
            : '—'}
        </span>
      </div>
      <div className="pick-flow-row">
        <span className="pick-flow-label">Picks in</span>
        <span className="pick-flow-value">
          {result.incomingPicks.length
            ? result.incomingPicks.map(label).join(', ')
            : '—'}
        </span>
      </div>
    </div>
  );
}

// A compact readout of how much room remains to each apron after the deal.
function ApronProximity({ result }: { result: TeamTradeResult }) {
  const post = summarizeSeason(result.postSalary, CURRENT_SEASON);
  const info = TIER_INFO[post.tier];
  const rows = [
    { label: 'to 1st apron', space: post.spaceUnderFirstApron },
    { label: 'to 2nd apron', space: post.spaceUnderSecondApron },
  ];
  return (
    <div className="proximity">
      <div className={`proximity-tier tier-${info.color}`}>
        After trade: <strong>{info.label}</strong>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="proximity-row">
          <span>{r.label}</span>
          <span className={r.space < 0 ? 'space-over' : 'space-under'}>
            {r.space < 0
              ? `${money(Math.abs(r.space))} over`
              : `${money(r.space)} of room`}
          </span>
        </div>
      ))}
      {result.hardCappedAt && (
        <div className="proximity-hardcap">
          Hard-capped at the {result.hardCappedAt === 'firstApron' ? 'first' : 'second'} apron
        </div>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onToggle,
}: {
  player: Player;
  selected: boolean;
  onToggle: () => void;
}) {
  const salary = playerSalaryForSeason(player, CURRENT_SEASON);
  const tradable = salary > 0 && !player.twoWay;
  const darko = darkoFor(player.name);
  const term = contractTerm(player, CURRENT_SEASON);
  return (
    <button
      className={`trade-player${selected ? ' selected' : ''}${
        tradable ? '' : ' untradable'
      }`}
      onClick={tradable ? onToggle : undefined}
      disabled={!tradable}
      title={
        tradable ? '' : player.twoWay ? 'Two-way contract' : 'No current-season salary to trade'
      }
    >
      <span className="tp-check">{selected ? '✓' : ''}</span>
      <span className="tp-name">
        {player.name}
        {tradable && (
          <span
            className={`tp-term${term.years <= 1 ? ' expiring' : ''}`}
            title={
              term.years <= 1
                ? 'Expiring contract'
                : `Controlled through ${term.label} · ${term.years} yrs`
            }
          >
            {term.label}
          </span>
        )}
      </span>
      <span className="tp-pos">{player.position}</span>
      <span className="tp-dpm" title="DARKO Daily Plus-Minus">
        {darko ? dpmFmt(darko.dpm) : '·'}
      </span>
      <span className="tp-value" title="DARKO market value">
        {darko?.value != null ? money(darko.value * 1_000_000) : '·'}
      </span>
      <span className="tp-salary">{player.twoWay ? 'TW' : tradable ? money(salary) : '—'}</span>
    </button>
  );
}
