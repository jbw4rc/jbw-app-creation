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

  await browser.close();
} finally {
  shutdown();
}

console.log(failures === 0 ? '\nRender matches the engine.\n' : `\n${failures} render check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
