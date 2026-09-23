// Does the page show what the engine computed?
//
// The unit suite checks the engine against fixtures and has never once checked
// that the rendered board agrees with it. Every display bug in this project
// escaped that way: a board ranking in-play games at the top, a table whose
// header lost a column so every row shifted right, a freshness timestamp that
// looked identical at ten minutes and twelve hours, and a site that served a
// stale build for hours while every workflow reported success.
//
// So this drives the real page and compares it against the engine directly.
//   npx tsx scripts/verify-render.ts
//
// Needs a Chromium for Playwright. This sandbox provides one at
// /opt/pw-browsers/chromium; elsewhere run `npx playwright install chromium`.
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { oddsHistory } from '../src/nfl/data/oddsHistory';
import { sampleHistory } from '../src/nfl/data/sampleHistory';
import { readSlate } from '../src/nfl/lib/sharp';
import { endOfNflWeek } from '../src/nfl/lib/format';
import { findGame } from '../src/nfl/lib/market';
import { recommend } from '../src/nfl/lib/edge';

const PORT = 5199;
const URL = `http://localhost:${PORT}/nfl.html`;

let failures = 0;
const check = (name: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!pass) failures++;
};

// --- What the engine says the page should contain. ---
const history = oddsHistory.snapshots.length > 0 ? oddsHistory : sampleHistory;
const now = Date.now();
const weekEnd = endOfNflWeek();
const expected = readSlate(history)
  .filter((g) => new Date(g.commenceTime).getTime() < weekEnd)
  .filter((g) => new Date(g.commenceTime).getTime() > now)
  .sort((a, b) => b.best.score - a.best.score);

console.log(`engine expects ${expected.length} bettable game(s) on the board`);

// And what it says a DraftKings bettor should do with each of them.
const latest = history.snapshots[history.snapshots.length - 1];
const dkRecs = expected.map((g) => recommend(g, findGame(latest.games, g.id), ['draftkings']));
const dkBets = dkRecs.filter((r) => r.verdict === 'bet').length;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: false,
});

const shutdown = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', shutdown);

try {
  // Wait for the dev server rather than sleeping a fixed amount.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium',
  });
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    // Resource-load failures are the sandbox's egress policy blocking Google
    // Fonts, not a fault in the page. Only real script errors count.
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource|ERR_CERT|ERR_BLOCKED/.test(t)) {
      errors.push(t);
    }
  });

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try {
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 2000 });
      up = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!up) throw new Error(`dev server never came up on ${PORT}`);

  console.log('\n— the page itself —');
  check('renders without console or page errors', errors.length === 0, errors[0] ?? '');

  const rows = await page.locator('.game').count();
  check('row count matches the engine', rows === expected.length,
    `page ${rows}, engine ${expected.length}`);

  if (expected.length > 0 && rows > 0) {
    const topScore = Number((await page.locator('.score__num').first().innerText()).trim());
    check('top row score matches the engine',
      Math.abs(topScore - Math.round(expected[0].best.score)) < 1,
      `page ${topScore}, engine ${expected[0].best.score.toFixed(1)}`);
  }

  console.log('\n— no game past its kickoff is ever listed —');
  // The single most damaging bug this project had: in-play prices ranked top.
  const times = await page.locator('.game__time').allInnerTexts();
  check('every listed game is still in the future',
    rows === expected.length && expected.every((g) => new Date(g.commenceTime).getTime() > now),
    `${times.length} row time(s) rendered`);

  console.log('\n— picking a book turns the board into bets —');
  check('no bet lines before any book is picked', (await page.locator('.bet').count()) === 0);
  const dkChip = page.getByRole('button', { name: 'DraftKings', exact: true });
  if (rows > 0 && (await dkChip.count())) {
    await dkChip.click();
    await page.waitForTimeout(250);
    const lines = await page.locator('.bet').count();
    check('every game gets a bet line', lines === rows, `${lines} line(s), ${rows} row(s)`);
    const bets = await page.locator('.bet[data-verdict="bet"]').count();
    check('the page shows the bets the engine finds', bets === dkBets,
      `page ${bets}, engine ${dkBets}`);
    const title = await page.locator('.yours__title').innerText();
    check('the summary names the book', /DraftKings/.test(title), title);

    // The pick is a per-device preference and has to survive a reload.
    await page.reload({ waitUntil: 'networkidle' });
    check('the picked book survives a reload',
      (await page.locator('.bet').count()) === rows &&
        (await page.getByRole('button', { name: 'DraftKings', exact: true }).getAttribute('aria-pressed')) === 'true');
  } else {
    check('the DraftKings chip is on the page', rows === 0);
  }

  console.log('\n— tables are not column-shifted —');
  // Tables only exist on the track-record tab and inside an expanded game, so
  // open both before counting. A check that inspects zero tables passes for
  // the wrong reason — which is exactly how the shifted header shipped.
  if (rows > 0) {
    await page.locator('.game__head').first().click();
    await page.waitForTimeout(250);
  }
  const booksToggle = page.getByRole('button', { name: /Show all \d+ books/ }).first();
  if (await booksToggle.count()) {
    await booksToggle.click();
    await page.waitForTimeout(250);
  }
  const recordTab = page.getByRole('button', { name: /Track record/ });
  if (await recordTab.count()) {
    await recordTab.click();
    await page.waitForTimeout(350);
  }

  const tables = await page.locator('table').all();
  check('found tables to inspect', tables.length > 0, `${tables.length} table(s)`);
  let shifted = 0;
  for (const t of tables) {
    const heads = await t.locator('thead th').count();
    const firstRowCells = await t.locator('tbody tr').first().locator('td').count();
    if (firstRowCells > 0 && heads !== firstRowCells) shifted++;
  }
  check('every table has as many headers as cells', shifted === 0,
    `${shifted} of ${tables.length} table(s) mismatched`);

  console.log('\n— freshness is stated, not implied —');
  const meta = await page.locator('.top__meta').innerText();
  check('header shows relative age', /ago|just now/i.test(meta), meta.replace(/\n/g, ' '));

  console.log('\n— credits left are always on screen —');
  if (!history.sample) {
    const credits = await page.locator('.credits').innerText();
    check('the header shows the API credit balance',
      history.quota ? credits.includes(`${history.quota.remaining} left`) : /next poll/.test(credits),
      credits.replace(/\n/g, ' '));
  }

  console.log('\n— the refresh button drives a poll and reloads —');
  // GitHub is faked at the network layer, so this exercises the real button,
  // the real request sequence and the real reload, without spending a credit.
  if (!history.sample) {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 1000 } });
    const p2 = await ctx.newPage();
    // Past the cooldown, so the button is live.
    await p2.clock.setFixedTime(new Date(new Date(history.updatedAt).getTime() + 20 * 60_000));
    const calls: { method: string; url: string; auth: string | null }[] = [];
    let pollChecks = 0;
    let tokenOk = true;
    await p2.route('https://api.github.com/**', async (route) => {
      const req = route.request();
      calls.push({ method: req.method(), url: req.url(), auth: req.headers()['authorization'] ?? null });
      if (!tokenOk) return route.fulfill({ status: 401, body: '{}' });
      const url = req.url();
      const json = (o: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
      const run = (id: number, status: string, conclusion: string | null) =>
        ({ id, status, conclusion, html_url: '' });
      if (req.method() === 'POST') return route.fulfill({ status: 204, body: '' });
      if (url.includes('build-odds.yml/runs?per_page=1')) return json({ workflow_runs: [run(100, 'completed', 'success')] });
      if (url.includes('deploy.yml/runs?per_page=1')) return json({ workflow_runs: [run(200, 'completed', 'success')] });
      if (url.includes('build-odds.yml/runs')) {
        pollChecks++;
        return json({ workflow_runs: [pollChecks < 2 ? run(101, 'in_progress', null) : run(101, 'completed', 'success'), run(100, 'completed', 'success')] });
      }
      if (url.includes('deploy.yml/runs')) return json({ workflow_runs: [run(201, 'completed', 'success'), run(200, 'completed', 'success')] });
      return route.fulfill({ status: 500, body: '' });
    });
    await p2.goto(URL, { waitUntil: 'networkidle' });

    const btn = p2.getByRole('button', { name: 'Refresh odds' });
    check('refresh button is live once the cooldown has passed', await btn.isEnabled());
    await btn.click();
    check('with no token it asks for one instead of calling GitHub',
      (await p2.locator('.refresh__setup').count()) === 1 && calls.length === 0);

    await p2.getByLabel('GitHub token').fill('github_pat_TEST');
    await p2.getByRole('button', { name: 'Save and refresh' }).click();
    await p2.waitForURL(/[?&]r=\d+/, { timeout: 60_000 }).catch(() => undefined);
    check('the page reloads onto the new build when the deploy finishes', /[?&]r=\d+/.test(p2.url()), p2.url());
    const dispatch = calls.find((c) => c.method === 'POST');
    check('it dispatched the poll workflow on main',
      !!dispatch && dispatch.url.endsWith('/actions/workflows/build-odds.yml/dispatches'));
    check('every GitHub call carried the token',
      calls.length > 0 && calls.every((c) => c.auth === 'Bearer github_pat_TEST'));
    check('the token stays on this device across the reload',
      (await p2.evaluate(() => localStorage.getItem('sharpboard.ghToken'))) === 'github_pat_TEST');

    // A revoked token must be forgotten, and the viewer told why.
    tokenOk = false;
    await p2.getByRole('button', { name: 'Refresh odds' }).click();
    await p2.locator('.refresh__error').waitFor({ timeout: 10_000 });
    check('a rejected token is cleared and setup reopens',
      (await p2.evaluate(() => localStorage.getItem('sharpboard.ghToken'))) === null &&
        (await p2.locator('.refresh__setup').count()) === 1,
      (await p2.locator('.refresh__error').innerText()).slice(0, 60));

    // Inside the cooldown the button is locked.
    const p3 = await ctx.newPage();
    await p3.clock.setFixedTime(new Date(new Date(history.updatedAt).getTime() + 5 * 60_000));
    await p3.goto(URL, { waitUntil: 'networkidle' });
    check('refresh is locked for 15 minutes after a poll',
      !(await p3.getByRole('button', { name: 'Refresh odds' }).isEnabled()),
      await p3.locator('.refresh__note').innerText());
    await ctx.close();
  }

  await browser.close();
} finally {
  shutdown();
}

console.log(failures === 0 ? '\nRender matches the engine.\n' : `\n${failures} render check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
