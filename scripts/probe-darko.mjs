// Read-only diagnostic: map where darko.app serves its data TODAY.
// Prints (1) how each page embeds data in HTML, (2) what each SvelteKit
// __data.json route returns, (3) URLs/fetch calls found in the JS bundles.
// Commits nothing. Run in CI (the dev sandbox can't reach darko.app).
const H = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/json,*/*',
};
const BASE = 'https://www.darko.app';
const hr = (t) => console.log(`\n===== ${t} =====`);
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s).replace(/\s+/g, ' ');

async function get(url) {
  try {
    const r = await fetch(url, { headers: H, redirect: 'follow' });
    const text = await r.text();
    return { status: r.status, url: r.url, type: r.headers.get('content-type') || '', text };
  } catch (e) {
    return { status: 0, url, type: '', text: '', err: String(e) };
  }
}

// ---- devalue-style flat array resolver (SvelteKit __data.json) -------------
function resolveFlat(D, root = 0) {
  const memo = new Map();
  const rec = (i, depth) => {
    if (typeof i !== 'number') return i;
    if (i < 0) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = D[i];
    if (v === null || typeof v !== 'object') return v;
    if (depth > 12) return '[deep]';
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string') return { __tag: v[0], v: v.slice(1).map((x) => rec(x, depth + 1)) };
      const arr = [];
      memo.set(i, arr);
      for (const x of v) arr.push(rec(x, depth + 1));
      return arr;
    }
    const o = {};
    memo.set(i, o);
    for (const [k, x] of Object.entries(v)) o[k] = rec(x, depth + 1);
    return o;
  };
  return rec(root, 0);
}
function shape(v, depth = 0, name = 'root', lines = []) {
  const pad = '  '.repeat(depth);
  if (Array.isArray(v)) {
    lines.push(`${pad}${name}: array(${v.length})`);
    if (v.length && depth < 3 && v[0] && typeof v[0] === 'object') shape(v[0], depth + 1, '[0]', lines);
  } else if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    if (depth >= 3 || ks.length > 40) {
      lines.push(`${pad}${name}: object{${ks.length} keys} ${ks.slice(0, 80).join(',')}`);
    } else {
      lines.push(`${pad}${name}: object{${ks.length}}`);
      for (const k of ks) shape(v[k], depth + 1, k, lines);
    }
  } else {
    lines.push(`${pad}${name}: ${typeof v} ${clip(String(v), 40)}`);
  }
  return lines;
}

// ---- 1) HTML pages ---------------------------------------------------------
hr('1. HTML PAGES — how data is embedded');
for (const path of ['/', '/scatterplot', '/longevity', '/trajectories', '/projections']) {
  const r = await get(BASE + path);
  console.log(`\n--- GET ${path} -> ${r.status} ${r.type} ${r.text.length.toLocaleString()} bytes ${r.err || ''}`);
  const scripts = [...r.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], body: m[2] }));
  console.log(`scripts: ${scripts.length} · lengths: ${scripts.map((s) => s.body.length).join(', ')}`);
  const bigs = [...scripts].sort((a, b) => b.body.length - a.body.length).slice(0, 2);
  for (const s of bigs) {
    console.log(`  big script (${s.body.length}) attrs[${clip(s.attrs, 60)}] head: ${clip(s.body, 140)}`);
    const keys = [...new Set([...s.body.matchAll(/["']?([a-z][a-z0-9_]*)["']?\s*:/g)].map((m) => m[1]))].filter((k) => k.includes('_') || /^(dpm|age|season|position)$/.test(k));
    console.log(`  snake_case keys (${keys.length}): ${keys.slice(0, 120).join(' ')}`);
  }
  const k = r.text.indexOf('Jokic');
  console.log(k < 0 ? '  "Jokic": not found in HTML' : `  "Jokic" context: ${clip(r.text.slice(Math.max(0, k - 160), k + 420), 580)}`);
  const m = r.text.match(/kit\.start\([\s\S]*?data:\s*([\s\S]{0,200})/);
  if (m) console.log(`  kit.start data head: ${clip(m[1], 160)}`);
}

// ---- 2) __data.json routes -------------------------------------------------
hr('2. SVELTEKIT __data.json ROUTES');
for (const path of ['/__data.json', '/scatterplot/__data.json', '/longevity/__data.json', '/trajectories/__data.json', '/projections/__data.json', '/compare/__data.json', '/lineups/__data.json', '/player/203999/__data.json']) {
  const r = await get(BASE + path);
  console.log(`\n--- GET ${path} -> ${r.status} ${r.type} ${r.text.length.toLocaleString()} bytes ${r.err || ''}`);
  if (r.status !== 200) { console.log(`  body head: ${clip(r.text, 160)}`); continue; }
  let j;
  try { j = JSON.parse(r.text); } catch { console.log(`  not JSON; head: ${clip(r.text, 200)}`); continue; }
  const nodes = j.nodes || [];
  console.log(`  nodes: ${nodes.length} · types: ${nodes.map((n) => (n ? n.type : 'null')).join(',')}`);
  nodes.forEach((n, ni) => {
    if (!n || n.type !== 'data' || !Array.isArray(n.data)) return;
    try {
      const resolved = resolveFlat(n.data, 0);
      console.log(`  node[${ni}] data (${n.data.length} slots):`);
      for (const line of shape(resolved).slice(0, 40)) console.log('    ' + line);
    } catch (e) {
      console.log(`  node[${ni}] resolve failed: ${e}`);
    }
  });
}

// ---- 3) JS bundle crawl: where do fetches go? ------------------------------
hr('3. JS BUNDLES — fetch targets / endpoints');
const home = await get(BASE + '/');
const seeds = [...home.text.matchAll(/import\("(\.\/_app\/immutable\/entry\/[^"]+\.js)"\)/g)].map((m) => new URL(m[1], BASE + '/').href);
const seen = new Set();
const queue = [...seeds];
const found = new Map(); // finding -> files
const note = (key, file) => { if (!found.has(key)) found.set(key, new Set()); found.get(key).add(file.split('/').pop()); };
const NOISE = /fonts\.(googleapis|gstatic)|w3\.org|github\.com|x\.com|twitter\.com|reactjs|svelte\.dev|kit\.svelte|example\.com|mozilla\.org|\.svg|schema\.org/;
let fetched = 0;
while (queue.length && fetched < 140) {
  const batch = queue.splice(0, 6).filter((u) => !seen.has(u));
  await Promise.all(batch.map(async (u) => {
    seen.add(u);
    const r = await get(u);
    if (r.status !== 200) return;
    fetched++;
    const t = r.text;
    for (const m of t.matchAll(/["'`](\.{1,2}\/[^"'`\s]+\.js)["'`]/g)) {
      const next = new URL(m[1], u).href;
      if (!seen.has(next) && next.includes('/_app/')) queue.push(next);
    }
    for (const m of t.matchAll(/fetch\(([^)]{0,140})\)/g)) note('fetch(' + clip(m[1], 120) + ')', u);
    for (const m of t.matchAll(/["'`](\/api\/[A-Za-z0-9_\/\-\.]*)/g)) note('API ' + m[1], u);
    for (const m of t.matchAll(/["'`]([A-Za-z0-9_\/\-\.]*__data\.json[^"'`]*)/g)) note('DATAJSON ' + m[1], u);
    for (const m of t.matchAll(/https?:\/\/[A-Za-z0-9.\-]+\.[a-z]{2,}[^\s"'`\\)<>]{0,90}/g)) if (!NOISE.test(m[0])) note('URL ' + m[0], u);
    for (const m of t.matchAll(/["'`]([A-Za-z0-9_\/\-\.]{3,60}\.json)["'`]/g)) note('JSONFILE ' + m[1], u);
    for (const m of t.matchAll(/supabase|firebase|r2\.dev|cloudfront|s3\.amazonaws|storage\.googleapis|githubusercontent/gi)) note('HOST-HINT ' + m[0], u);
  }));
}
console.log(`crawled ${fetched} JS files from ${seeds.length} seeds`);
const keys = [...found.keys()].sort();
console.log(`${keys.length} distinct findings:`);
for (const k of keys.slice(0, 160)) console.log(`  ${k}   [${[...found.get(k)].slice(0, 3).join(', ')}]`);
console.log('\n===== END PROBE =====');
