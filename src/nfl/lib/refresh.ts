// Start a live poll from the page itself.
//
// The site is static, so it cannot hold a secret: anything in the bundle is
// public. Instead the viewer supplies their own GitHub token, kept only in
// their browser, and the page asks GitHub to run the same "Build NFL odds"
// workflow the schedule runs. The Odds API key never leaves the repo secrets.
//
// The token needs one permission — Actions: read and write — on this one repo.
// With it, the worst anyone could do is run this repo's workflows.

export const OWNER = 'jbw4rc';
export const REPO = 'jbw-app-creation';
export const POLL_WORKFLOW = 'build-odds.yml';
export const DEPLOY_WORKFLOW = 'deploy.yml';
/** Credits one poll costs: 2 regions x 2 markets. */
export const CREDITS_PER_POLL = 4;
/**
 * Below this many credits the readout turns amber: roughly ten polls, which is
 * one Sunday's coverage. Time to cycle the key before the month runs dry.
 */
export const LOW_CREDITS = 40;
/** Lines barely move inside this window, so a poll here mostly burns credits. */
export const COOLDOWN_MINUTES = 15;

const TOKEN_KEY = 'sharpboard.ghToken';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/actions`;

export const WORKFLOW_PAGE = `https://github.com/${OWNER}/${REPO}/actions/workflows/${POLL_WORKFLOW}`;
export const NEW_TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new';

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* the token just won't be remembered on this device */
  }
}

export class TokenError extends Error {}

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
}

async function gh(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new TokenError(
      res.status === 401
        ? 'GitHub did not accept that token — it may have expired or been mistyped.'
        : 'That token cannot run workflows on this repo. It needs Actions: read and write on jbw4rc/jbw-app-creation.'
    );
  }
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
  return res;
}

async function latestRunId(token: string, workflow: string): Promise<number> {
  const res = await gh(token, `/workflows/${workflow}/runs?per_page=1`);
  const body = (await res.json()) as { workflow_runs: Run[] };
  return body.workflow_runs[0]?.id ?? 0;
}

/** The first run of `workflow` newer than `afterId`, if one exists yet. */
async function runAfter(token: string, workflow: string, afterId: number): Promise<Run | null> {
  const res = await gh(token, `/workflows/${workflow}/runs?per_page=5`);
  const body = (await res.json()) as { workflow_runs: Run[] };
  const newer = body.workflow_runs.filter((r) => r.id > afterId).sort((a, b) => a.id - b.id);
  return newer[0] ?? null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Stage = 'starting' | 'polling' | 'deploying';

/**
 * Run a poll and wait for the site to redeploy with it. Resolves when the new
 * build is live; `onStage` reports progress. Throws TokenError on auth
 * problems so the caller can ask for a new token.
 */
export async function refreshOdds(
  token: string,
  onStage: (s: Stage) => void,
  { interval = 6000, timeout = 10 * 60_000 } = {}
): Promise<void> {
  const deadline = Date.now() + timeout;
  onStage('starting');
  // Note the newest runs BEFORE dispatching. Matching on ids rather than
  // timestamps means a phone clock that is a minute off cannot pick up the
  // wrong run.
  const pollBefore = await latestRunId(token, POLL_WORKFLOW);
  const deployBefore = await latestRunId(token, DEPLOY_WORKFLOW);
  await gh(token, `/workflows/${POLL_WORKFLOW}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' }),
  });

  onStage('polling');
  let poll: Run | null = null;
  while (Date.now() < deadline) {
    await wait(interval);
    poll = await runAfter(token, POLL_WORKFLOW, pollBefore);
    if (poll?.status === 'completed') break;
  }
  if (!poll || poll.status !== 'completed') throw new Error('The poll is taking unusually long. Check GitHub Actions.');
  if (poll.conclusion !== 'success') throw new Error(`The poll failed (${poll.conclusion}). Check GitHub Actions.`);

  onStage('deploying');
  while (Date.now() < deadline) {
    await wait(interval);
    const deploy = await runAfter(token, DEPLOY_WORKFLOW, deployBefore);
    if (deploy?.status === 'completed') {
      if (deploy.conclusion !== 'success') throw new Error(`The site rebuild failed (${deploy.conclusion}).`);
      return;
    }
  }
  throw new Error('The site rebuild is taking unusually long. Try reloading in a minute.');
}
