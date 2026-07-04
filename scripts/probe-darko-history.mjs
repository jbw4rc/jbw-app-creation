// PROBE v2: darko.app/player/{id}/__data.json exposes career history.
// Figure out its structure so we can extract a per-season DPM series.
import { writeFileSync } from 'fs';
const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,*/*',
};
const out = [];
const log = (...a) => { out.push(a.join(' ')); console.log(...a); };

// Jokic (203999) and Wembanyama (1641705) — one long career, one short.
for (const [name, id] of [['Jokic', '203999'], ['Wembanyama', '1641705']]) {
  const r = await fetch(`https://darko.app/player/${id}/__data.json`, { headers: H });
  const body = await r.text();
  log(`\n### ${name} (${id}) -> ${r.status} ${body.length}b`);
  let j;
  try { j = JSON.parse(body); } catch (e) { log('  parse fail ' + e); continue; }

  // SvelteKit __data.json: {type:'data', nodes:[...]} where a node has
  // {type:'data', data:[...]} using an index-dedup array. Walk it.
  const node = (j.nodes || []).find((n) => n && n.type === 'data' && Array.isArray(n.data));
  if (!node) { log('  no data node; top keys ' + Object.keys(j)); continue; }
  const D = node.data; // flat dedup array
  log(`  dedup array length ${D.length}`);

  // The root object maps field->index. Find an entry that looks like the
  // history/rows key (points to an array of ints = record indices).
  const root = D[0];
  log('  root keys: ' + (root && typeof root === 'object' ? Object.keys(root).join(',') : typeof root));

  // Resolve helper: given an index, if it's an object of field->idx, expand one level.
  const expand = (idx) => {
    const o = D[idx];
    if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
    const r = {};
    for (const k of Object.keys(o)) r[k] = D[o[k]];
    return r;
  };

  // Try each root field: if it points to an array, expand first element.
  if (root && typeof root === 'object') {
    for (const k of Object.keys(root)) {
      const v = D[root[k]];
      if (Array.isArray(v)) {
        log(`  root.${k} -> array[${v.length}]`);
        const first = expand(v[0]);
        if (first && typeof first === 'object') {
          const keys = Object.keys(first);
          log(`    record keys(${keys.length}): ${keys.slice(0, 40).join(',')}`);
          // Distinct seasons + a sample of (season,dpm,age).
          const seasons = new Set();
          const samples = [];
          for (let i = 0; i < Math.min(v.length, 2000); i++) {
            const rec = expand(v[i]);
            if (rec && rec.season != null) {
              seasons.add(rec.season);
              if (i % Math.ceil(v.length / 12) === 0)
                samples.push(`s${rec.season} dpm=${rec.dpm} age=${typeof rec.age === 'number' ? rec.age.toFixed(1) : rec.age} fg=${rec.future_game}`);
            }
          }
          log(`    distinct seasons: ${[...seasons].sort().join(',')}`);
          log(`    samples: ${samples.join(' | ')}`);
        } else {
          log(`    first elem: ${JSON.stringify(first).slice(0, 120)}`);
        }
      }
    }
  }
}
writeFileSync('probe-darko-history-out.txt', out.join('\n') + '\n');
log('\nWROTE');
