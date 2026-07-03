import { useMemo, useState } from 'react';
import type { Team } from '../types';
import { SEEDED_CAP_HOLDS, type CapHold, type CapHoldType } from '../data/seededCapHolds';
import { CURRENT_SEASON } from '../data/leagueConstants';
import { summarizeTeamSeason } from '../lib/apron';
import { money } from '../lib/format';

// Cap-holds explorer: what unsigned charges sit on a team's cap, by type, with
// plain-language context on what a hold is and how it affects the cap, the tax
// and aprons, and what the team can do in transactions.

type Filter = 'all' | CapHoldType;

const TYPE_LABEL: Record<CapHoldType, string> = {
  veteran: 'Veteran FA (Bird)',
  rfa: 'Restricted FA',
  draftPick: 'Draft Pick (Rookie Scale)',
};

const TYPE_BLURB: Record<CapHoldType, string> = {
  veteran:
    "When your own free agent hits the market, a placeholder — roughly 120–190% of his prior salary depending on his Bird rights — stays on your cap. It preserves your right to re-sign him over the cap; renounce it to free the space, but you lose that right.",
  rfa: "A restricted free agent's hold (his qualifying offer or a rookie-scale-based amount) reserves his spot while you keep the right to match any offer sheet he signs elsewhere.",
  draftPick:
    'An unsigned first-round pick holds 120% of his rookie-scale slot against the cap until he actually signs.',
};

// The four impact areas the user asked to explain.
const IMPACTS: { head: string; body: string }[] = [
  {
    head: 'Salary Cap',
    body: 'Holds COUNT against the cap. A team under the cap must renounce holds to open room — but renouncing your own free agent means you can only re-sign him with cap space, not his Bird rights.',
  },
  {
    head: 'Tax Line & Aprons',
    body: 'Holds do NOT count toward the luxury tax or either apron — those use actual contracts only. A team can be capped out by holds yet still under the tax until it signs players.',
  },
  {
    head: 'Transactions',
    body: 'To sign an outside free agent with cap room, you renounce holds to clear space. Teams operating over the cap instead keep their holds and sign using exceptions (Bird, MLE, BAE).',
  },
  {
    head: 'Roster Charges',
    body: 'A hold also fills a roster slot for cap math: teams with fewer than 12 players (counting holds) take an incomplete-roster charge at the rookie minimum for each empty spot.',
  },
];

export function CapHolds({ team }: { team: Team }) {
  const [filter, setFilter] = useState<Filter>('all');
  const holds = SEEDED_CAP_HOLDS[team.abbreviation] ?? [];

  const byType = useMemo(() => {
    const g: Record<CapHoldType, CapHold[]> = { veteran: [], rfa: [], draftPick: [] };
    for (const h of holds) g[h.type].push(h);
    return g;
  }, [holds]);

  const shown = useMemo(() => {
    const list = filter === 'all' ? holds : byType[filter];
    return [...list].sort((a, b) => b.amount - a.amount);
  }, [holds, byType, filter]);

  const total = holds.reduce((s, h) => s + h.amount, 0);
  const summary = summarizeTeamSeason(team, CURRENT_SEASON);
  const underCap = summary.tier === 'underCap';
  const capRoom = summary.spaceUnderCap; // positive when under the cap

  return (
    <div className="cap-holds">
      <div className="ch-head">
        <div>
          <span className="cs-kicker">Cap Holds</span>
          <h3 className="ch-title">Unsigned charges on the cap</h3>
        </div>
        <label className="ch-filter">
          <span>Cap Hold Type</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">All types</option>
            <option value="veteran">{TYPE_LABEL.veteran}</option>
            <option value="rfa">{TYPE_LABEL.rfa}</option>
            <option value="draftPick">{TYPE_LABEL.draftPick}</option>
          </select>
        </label>
      </div>

      <div className="ch-explain">
        <p className="ch-what">
          A <strong>cap hold</strong> is a placeholder amount that counts against a team's{' '}
          <strong>salary cap</strong> for a free agent or draft pick it still controls but hasn't
          signed. It stops a team from both using cap space and keeping the right to re-sign its own
          players.
        </p>
        {filter !== 'all' && <p className="ch-typeblurb">{TYPE_BLURB[filter]}</p>}
      </div>

      <div className="ch-totalbar">
        <div className="ch-total">
          <span className="ch-total-label">
            {filter === 'all' ? 'Total holds' : TYPE_LABEL[filter]}
          </span>
          <span className="ch-total-val">
            {money(filter === 'all' ? total : byType[filter].reduce((s, h) => s + h.amount, 0))}
          </span>
        </div>
        <div className="ch-roomnote">
          {underCap
            ? `${money(Math.max(0, capRoom))} in cap room — holds consume it until renounced.`
            : 'Over the cap: holds don’t reduce room, but preserve re-signing (Bird) rights.'}
        </div>
      </div>

      {holds.length > 0 ? (
        <table className="ch-table">
          <thead>
            <tr>
              <th className="ch-name">Player / Pick</th>
              <th>Type</th>
              <th>Terms</th>
              <th>Age</th>
              <th className="ch-amt">Cap Hold</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((h, i) => (
              <tr key={i}>
                <td className="ch-name">{h.player}</td>
                <td>
                  <span className={`ch-tag ch-${h.type}`}>{TYPE_LABEL[h.type]}</span>
                </td>
                <td className="ch-terms">{h.terms ?? '—'}</td>
                <td>{h.age ?? '—'}</td>
                <td className="ch-amt">{money(h.amount)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="ch-empty">No {TYPE_LABEL[filter as CapHoldType]} holds.</td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <div className="ch-empty ch-none">
          No cap holds on the books — every free agent has been renounced or re-signed.
        </div>
      )}

      <div className="ch-impacts">
        <span className="ch-impacts-head">What holds affect</span>
        <div className="ch-impacts-grid">
          {IMPACTS.map((im) => (
            <div key={im.head} className="ch-impact">
              <span className="ch-impact-head">{im.head}</span>
              <span className="ch-impact-body">{im.body}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="ch-foot">Cap holds from SalarySwish; amounts are this season's cap charge.</p>
    </div>
  );
}
