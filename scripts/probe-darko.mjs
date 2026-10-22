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

// ---- SalarySwish: roster-section headers on a team page --------------------
console.log('\n===== SALARYSWISH =====');
try {
  const r = await fetch('https://www.salaryswish.com/teams/knicks', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
  });
  const html = await r.text();
  console.log(`knicks page: HTTP ${r.status}, ${html.length} bytes`);
  const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  console.log(`tables: ${tables.length}`);
  for (const t of tables) {
    const open = (t.match(/<table[^>]*>/i) || [''])[0];
    const rows = t.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const head = rows[0] ? (rows[0].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(strip) : [];
    const r1 = rows[1] ? (rows[1].match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(strip).slice(0, 6) : [];
    console.log(`- ${open.slice(0, 120)}\n    rows ${rows.length} · header: ${JSON.stringify(head.slice(0, 9))}\n    row1: ${JSON.stringify(r1)}`);
  }
  // Headings near tables (section labels may have moved out of the table)
  const heads = [...html.matchAll(/<(h[1-6]|caption|summary)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => `${m[1]}: ${strip(m[2])}`).filter((x) => x.length < 120);
  console.log('headings:', JSON.stringify(heads.slice(0, 40)));
} catch (e) { console.log('salaryswish error', e); }
console.log('===== END SALARYSWISH =====');
