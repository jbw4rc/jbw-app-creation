// PROBE: does darko.app expose prior-season (historical) DPM per player?
// We want a multi-year DPM history to build an empirical aging curve.
// Writes probe-darko-history-out.txt with findings. Delete after use.
import { writeFileSync } from 'fs';

const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};
const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };

async function get(url) {
  try {
    const r = await fetch(url, { headers: H });
    const ct = r.headers.get('content-type') || '';
    const body = await r.text();
    return { status: r.status, ct, body };
  } catch (e) {
    return { status: 0, ct: 'ERR', body: String(e) };
  }
}

// 1) Homepage: grab a known player id + inspect the data blob for season fields.
const home = await get('https://darko.app/');
log(`homepage -> ${home.status} ${home.ct} ${home.body.length}b`);
const scripts = [...home.body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const big = scripts.filter((x) => /player_name:/.test(x)).sort((a, b) => b.length - a.length)[0] || '';
log(`data script ${big.length}b`);

// What season-ish keys appear near a record? Sample around Jokic.
const jokic = big.indexOf('Nikola');
if (jokic > 0) {
  const slice = big.slice(jokic - 40, jokic + 700);
  log('--- record sample (Jokic) ---');
  log(slice.replace(/\s+/g, ' '));
}
// Distinct season values present in the blob.
const seasons = [...new Set([...big.matchAll(/(?:^|[,{])season:(\d{4})/g)].map((m) => m[1]))].sort();
log('distinct season: ' + seasons.join(','));
// Any career/history/prior/game-log style keys?
const keys = [...new Set([...big.matchAll(/[a-z_]{3,}:/g)].map((m) => m[0]))].sort();
log('KEYS(' + keys.length + '): ' + keys.join(' '));

// 2) Candidate historical endpoints. Jokic nba_id = 203999.
const id = '203999';
const urls = [
  `https://darko.app/player/${id}`,
  `https://darko.app/player/${id}/__data.json`,
  `https://darko.app/players/${id}`,
  `https://darko.app/players/${id}/__data.json`,
  `https://darko.app/history`,
  `https://darko.app/history/__data.json`,
  `https://darko.app/__data.json?season=2022`,
  `https://darko.app/?season=2022`,
  `https://darko.app/season/2022/__data.json`,
  `https://darko.app/api/history`,
  `https://darko.app/box`,
  `https://darko.app/box/__data.json`,
];
for (const u of urls) {
  const r = await get(u);
  let hint = '';
  if (r.ct.includes('json') && r.status === 200) {
    // Look for multiple seasons or date/game-log arrays.
    const ss = [...new Set([...r.body.matchAll(/\b(20(1|2)\d)\b/g)].map((m) => m[1]))].sort();
    hint = ` seasons~[${ss.slice(0, 12).join(',')}]`;
  }
  log(`${u} -> ${r.status} ${r.ct} ${r.body.length}b${hint}`);
}

writeFileSync('probe-darko-history-out.txt', out.join('\n') + '\n');
log('\nWROTE probe-darko-history-out.txt');
