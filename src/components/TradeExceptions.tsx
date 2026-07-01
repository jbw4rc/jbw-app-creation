import type { Team } from '../types';
import {
  tradeExceptionsFor,
  useTradeExceptions,
  type TradeException,
} from '../lib/tradeExceptionsStore';
import { money } from '../lib/format';

// Traded-player exceptions a team can use as trade assets, from the imported
// TPE list. Expired exceptions are set aside; live ones show remaining + expiry.

export function TradeExceptions({ team }: { team: Team }) {
  useTradeExceptions(); // re-render on import
  const all = tradeExceptionsFor(team.abbreviation);
  const live = all.filter((t) => !t.expired && t.remaining > 0);
  const expired = all.filter((t) => t.expired);
  const totalLive = live.reduce((s, t) => s + t.remaining, 0);

  return (
    <div className="tpe">
      <div className="tpe-head">
        <span>Trade Exceptions</span>
        {live.length > 0 && <span className="tpe-total">{money(totalLive)} live</span>}
      </div>

      {all.length === 0 ? (
        <div className="tpe-empty">
          No trade-exception data imported. Paste the TPE table in the Import tab
          to track them here.
        </div>
      ) : live.length === 0 ? (
        <div className="tpe-empty">No live trade exceptions.</div>
      ) : (
        <div className="tpe-list">
          {live.map((t, i) => (
            <TpeRow key={`${t.player}-${i}`} t={t} />
          ))}
        </div>
      )}

      {expired.length > 0 && (
        <div className="tpe-expired-note">
          {expired.length} expired exception{expired.length > 1 ? 's' : ''} not shown.
        </div>
      )}
    </div>
  );
}

function TpeRow({ t }: { t: TradeException }) {
  const partial = t.remaining < t.total;
  return (
    <div className="tpe-row">
      <div className="tpe-row-main">
        <span className="tpe-amount">{money(t.remaining)}</span>
        <span className="tpe-player">{t.player}</span>
      </div>
      <div className="tpe-row-sub">
        <span className="tpe-expiry">expires {t.end}</span>
        {partial && <span className="tpe-partial">of {money(t.total)}</span>}
      </div>
    </div>
  );
}
