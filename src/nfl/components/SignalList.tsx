// The per-line insights. Five rows, always the same five, always in the same
// order — including the ones that did not fire. A signal that stayed silent is
// information too: "the line never moved" is the reason a game is not a play,
// and hiding it would make a weak game look merely under-reported.
import type { GameRead, MarketRead } from '../lib/sharp';
import { WEIGHTS, sideLabel } from '../lib/sharp';
import { deltaLabel } from '../lib/format';

export function SignalList({ read, game }: { read: MarketRead; game: GameRead }) {
  return (
    <ul className="signals">
      {read.signals.map((s) => {
        const pct = Math.round((Math.abs(s.points) / WEIGHTS[s.id]) * 100);
        const state = !s.available ? 'missing' : s.strength > 0.05 ? 'on' : 'off';
        return (
          <li key={s.id} className="signal" data-state={state}>
            <div className="signal__head">
              <span className="signal__dot" />
              <span className="signal__label">{s.label}</span>
              {state === 'on' && (
                <span className="signal__side">
                  {sideLabel(s.side, game)}
                  <span className="signal__pts">{deltaLabel(Math.abs(s.points), 0)} pts</span>
                </span>
              )}
              {state === 'off' && <span className="signal__side signal__side--quiet">quiet</span>}
              {state === 'missing' && <span className="signal__side signal__side--quiet">n/a</span>}
            </div>
            <p className="signal__detail">{s.detail}</p>
            {state === 'on' && (
              <div className="signal__meter">
                <div className="signal__meterfill" style={{ width: `${pct}%` }} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
