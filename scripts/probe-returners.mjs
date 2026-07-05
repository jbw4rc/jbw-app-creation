// PROBE: for injured returners not in DARKO's current feed, can we pull their
// last healthy season from career history? And is there a name->nba_id resolver?
import { writeFileSync } from 'fs';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'text/html,application/json,*/*' };
const out = [];
const log = (...a) => out.push(a.join(' '));

// Known nba_ids for a few returners (to validate last-healthy extraction).
const RETURNERS = { 'Tyrese Haliburton': 1630169, 'Damian Lillard': 203081, 'Kyrie Irving': 202681, 'Fred VanVleet': 1627832 };

function decode(json) {
  let j; try { j = JSON.parse(json); } catch { return null; }
  const node = (j.nodes || []).find((n) => n && n.type === 'data' && Array.isArray(n.data));
  if (!node) return null;
  const D = node.data, root = D[0];
  if (!root || root.historyRows == null || !Array.isArray(D[root.historyRows])) return null;
  return D[root.historyRows].map((ri) => { const o = D[ri]; const g = (k) => D[o[k]]; return { season: g('season'), dpm: g('dpm'), age: g('age'), poss: g('poss'), secs: g('seconds_played'), fg: g('future_game'), cgn: g('career_game_num') }; });
}

for (const [name, id] of Object.entries(RETURNERS)) {
  try {
    const r = await fetch(`https://darko.app/player/${id}/__data.json`, { headers: H });
    if (!r.ok) { log(`${name} (${id}): HTTP ${r.status}`); continue; }
    const hist = decode(await r.text());
    if (!hist) { log(`${name}: no history`); continue; }
    // Reduce to per-season end-of-season DPM (last game with real minutes).
    const bySeason = new Map();
    for (const h of hist) {
      if (h.fg || !(h.poss > 0) || typeof h.dpm !== 'number') continue;
      const cur = bySeason.get(h.season);
      if (!cur || (h.cgn ?? 0) >= cur.cgn) bySeason.set(h.season, { season: h.season, dpm: h.dpm, age: h.age, cgn: h.cgn ?? 0, secs: 0 });
      const e = bySeason.get(h.season); e.secs += h.secs || 0;
    }
    const seasons = [...bySeason.values()].filter((s) => s.secs >= 500 * 60).sort((a, b) => b.season - a.season);
    const last = seasons[0];
    log(`${name} (${id}): seasons=[${[...bySeason.keys()].sort().join(',')}] · last healthy = ${last ? `${last.season} dpm ${last.dpm.toFixed(2)} age ${last.age.toFixed(1)}` : 'none'}`);
  } catch (e) { log(`${name}: ERR ${e}`); }
}

// Is there a name->id resolver on darko.app?
for (const u of ['https://darko.app/api/search?q=haliburton', 'https://darko.app/search/__data.json?q=haliburton', 'https://darko.app/players/__data.json']) {
  try { const r = await fetch(u, { headers: H }); log(`\n${u} -> ${r.status} ${r.headers.get('content-type')} ${(await r.text()).length}b`); } catch (e) { log(`${u} ERR`); }
}
writeFileSync('probe-returners-out.txt', out.join('\n') + '\n');
console.log('wrote');
