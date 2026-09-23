// "Refresh odds" — runs a live poll from the page, then reloads onto the new
// build. See lib/refresh.ts for why this needs the viewer's own GitHub token.
import { useEffect, useState } from 'react';
import {
  COOLDOWN_MINUTES, CREDITS_PER_POLL, LOW_CREDITS, NEW_TOKEN_PAGE, OWNER, REPO, WORKFLOW_PAGE,
  TokenError, loadToken, refreshOdds, saveToken,
} from '../lib/refresh';
import type { Stage } from '../lib/refresh';

const STAGE_TEXT: Record<Stage, string> = {
  starting: 'Starting poll…',
  polling: 'Pulling odds…',
  deploying: 'Rebuilding site…',
};


export function RefreshButton({
  updatedAt,
  remaining,
}: {
  updatedAt: string;
  remaining: number | null;
}) {
  // Tick so the cooldown counts down and unlocks without a reload.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const [token, setToken] = useState<string | null>(loadToken);
  const [setup, setSetup] = useState(false);
  const [draft, setDraft] = useState('');
  const [stage, setStage] = useState<Stage | 'done' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const minsSince = (now - new Date(updatedAt).getTime()) / 60_000;
  const coolingFor = Math.ceil(COOLDOWN_MINUTES - minsSince);
  const busy = stage !== null && stage !== 'done';
  const outOfCredits = remaining !== null && remaining < CREDITS_PER_POLL;
  const low = remaining !== null && remaining < LOW_CREDITS;

  const run = async (t: string) => {
    if (low && !window.confirm(`Only ${remaining} credits left this month. Spend ${CREDITS_PER_POLL} on a refresh?`)) {
      return;
    }
    setError(null);
    try {
      await refreshOdds(t, setStage);
      setStage('done');
      // Cache-bust the page itself: Pages serves HTML with a ten-minute cache,
      // and a plain reload can come back with the old build.
      const url = new URL(window.location.href);
      url.searchParams.set('r', String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      setStage(null);
      if (e instanceof TokenError) {
        saveToken(null);
        setToken(null);
        setSetup(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onClick = () => {
    if (!token) {
      setSetup(true);
      return;
    }
    void run(token);
  };

  const save = () => {
    const t = draft.trim();
    if (!t) return;
    saveToken(t);
    setToken(t);
    setDraft('');
    setSetup(false);
    void run(t);
  };

  let note: string;
  if (busy) note = STAGE_TEXT[stage as Stage];
  else if (stage === 'done') note = 'Updated — reloading…';
  else if (outOfCredits) note = 'Out of API credits this month';
  else if (coolingFor > 0) note = `Next refresh in ${coolingFor} min`;
  else note = `Uses ${CREDITS_PER_POLL} credits · live in ~3 min`;

  return (
    <div className="refresh">
      <button
        className="refresh__btn"
        onClick={onClick}
        disabled={busy || stage === 'done' || coolingFor > 0 || outOfCredits}
        aria-busy={busy}
      >
        {busy ? <span className="refresh__spin" aria-hidden /> : null}
        {busy ? 'Refreshing' : 'Refresh odds'}
      </button>
      <span className="refresh__note">{note}</span>
      {error && <span className="refresh__error" role="alert">{error}</span>}

      {setup && (
        <div className="refresh__setup">
          <p>
            <b>One-time setup on this device.</b> The site can't hold a key itself: anything in
            the page is public. So refreshing uses a GitHub token saved only in this browser.
          </p>
          <ol>
            <li>
              Open{' '}
              <a href={NEW_TOKEN_PAGE} target="_blank" rel="noreferrer">
                GitHub → new fine-grained token
              </a>
              .
            </li>
            <li>Name it "Sharp Board refresh" and pick an expiration.</li>
            <li>
              Repository access → <b>Only select repositories</b> →{' '}
              <code>{OWNER}/{REPO}</code>.
            </li>
            <li>
              Permissions → Repository → <b>Actions: Read and write</b>. Nothing else.
            </li>
            <li>Generate, copy, and paste it below.</li>
          </ol>
          <div className="refresh__row">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="github_pat_…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              aria-label="GitHub token"
            />
            <button className="refresh__btn" onClick={save} disabled={!draft.trim()}>
              Save and refresh
            </button>
            <button className="linkbtn" onClick={() => setSetup(false)}>
              Cancel
            </button>
          </div>
          <p className="refresh__fine">
            No token? You can also run it by hand: open{' '}
            <a href={WORKFLOW_PAGE} target="_blank" rel="noreferrer">
              Build NFL odds
            </a>{' '}
            on GitHub and tap <b>Run workflow</b>. The site updates about three minutes later.
          </p>
        </div>
      )}

      {token && !setup && !busy && (
        <button
          className="linkbtn refresh__forget"
          onClick={() => {
            saveToken(null);
            setToken(null);
          }}
        >
          forget token
        </button>
      )}
    </div>
  );
}
