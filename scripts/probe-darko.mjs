// Read-only diagnostic: how does darko.app pick the season it serves, and can we
// request one explicitly? Commits nothing. Run in CI (the sandbox can't reach darko.app).
import { fetchJson, resolveFlat, playerRows } from './lib/darko-data.mjs';

const summarize = (label, page) => {
  if (!page) return console.log(`${label}: (no data)`);
  let rows = [];
  try { rows = playerRows(page.players); } catch {}
  const dates = rows.map((r) => r.date).filter(Boolean).sort();
  const seasons = [...new Set(rows.map((r) => r.season).filter((x) => x != null))];
  const jok = rows.find((r) => /Jokic/.test(r.player_name || ''));
  console.log(`${label}: rows ${rows.length} · row seasons ${seasons.join(',') || '-'} · dates ${dates[0] ?? '-'}..${dates.at(-1) ?? '-'} · Jokic dpm ${jok?.dpm ?? '-'} · selectedSeason ${JSON.stringify(page.selectedSeason)} · asOf ${JSON.stringify(page.asOf)} · ratingsThrough ${JSON.stringify(page.ratingsThrough)}`);
};
const page = async (path) => {
  try {
    const j = await fetchJson(path);
    const node = (j?.nodes ?? []).filter((n) => n?.type === 'data').at(-1);
    return node ? resolveFlat(node.data, 0) : null;
  } catch (e) { console.log(`${path}: ERROR ${e}`); return null; }
};

const home = await page('/__data.json');
console.log('home keys:', Object.keys(home ?? {}).join(' '));
console.log('seasons list:', JSON.stringify(home?.seasons)?.slice(0, 600));

// Repeat the default request a few times: does the default flip between requests?
for (let i = 0; i < 4; i++) {
  summarize(`default / #${i}`, await page('/__data.json'));
  summarize(`default /scatterplot #${i}`, await page('/scatterplot/__data.json'));
}
for (const s of [2025, 2026, 2027]) {
  for (const q of [`season=${s}`, `year=${s}`]) {
    summarize(`/?${q}`, await page(`/__data.json?${q}`));
    summarize(`/scatterplot?${q}`, await page(`/scatterplot/__data.json?${q}`));
  }
}
// Per-player page: what season does Jokic's playerInfo say, and his latest history row?
try {
  const j = await fetchJson('/player/203999/__data.json');
  const node = (j?.nodes ?? []).filter((n) => n?.type === 'data').at(-1);
  const root = node.data[0];
  const info = resolveFlat(node.data, root.playerInfo);
  console.log('Jokic playerInfo:', JSON.stringify({ season: info.season, date: info.date, dpm: info.dpm, rating_date: info.rating_date }));
  const hist = playerRows(resolveFlat(node.data, root.history));
  const last = hist.filter((r) => !r.future_game).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-3);
  console.log('Jokic last played rows:', JSON.stringify(last.map((r) => ({ date: r.date, season: r.season, dpm: r.dpm }))));
} catch (e) { console.log('player page error', e); }
console.log('===== END PROBE =====');
