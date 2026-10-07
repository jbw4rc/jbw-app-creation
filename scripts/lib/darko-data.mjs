// Shared access to darko.app's data.
//
// darko.app is a SvelteKit app. Since ~Sep 2026 it no longer embeds player data
// in the page HTML; every route serves it as `<route>/__data.json` instead, in
// SvelteKit's "devalue" flat-array encoding (object values are indices into one
// flat array). This module fetches those endpoints and decodes them.
//
// Routes used (verified against the live site, Oct 2026):
//   /__data.json              players: column-oriented {keys, values} (salary, rank, …)
//   /scatterplot/__data.json  players: row objects — DPM family, projected box line,
//                             Bayes-RAPM, age, market value
//   /projections/__data.json  players: row objects — projected box line only
//   /player/{id}/__data.json  playerInfo (79 fields incl. position_num, x_position,
//                             s1..s15, rookie_season, x_retirement_age) + history
export const BASE = 'https://www.darko.app';
export const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/html,*/*',
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET + JSON.parse with retries on network errors / 429 / 5xx. null on 404. */
export async function fetchJson(path, { retries = 3 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(BASE + path, { headers: HEADERS, redirect: 'follow' });
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return JSON.parse(await r.text());
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(500 * attempt);
    }
  }
  throw new Error(`${path}: ${lastErr}`);
}

/**
 * Decode a devalue flat array. `D` is the node's `data` array; `root` is the
 * index to materialise (0 = the whole page payload). Numbers inside objects and
 * arrays are INDICES into D (D[i] may itself be a primitive). Negative indices
 * are devalue's sentinels (undefined/NaN/±Infinity) and decode to undefined.
 */
export function resolveFlat(D, root = 0) {
  const memo = new Map();
  const rec = (i, depth) => {
    if (typeof i !== 'number' || i < 0) return undefined;
    if (memo.has(i)) return memo.get(i);
    const v = D[i];
    if (v === null || typeof v !== 'object') return v;
    if (depth > 12) return undefined;
    if (Array.isArray(v)) {
      // Tagged specials (Date, Set, Map, …) start with a string; none carry data we use.
      if (typeof v[0] === 'string') return undefined;
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

function dataNode(json) {
  const nodes = json?.nodes ?? [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (n && n.type === 'data' && Array.isArray(n.data)) return n.data;
  }
  return null;
}

/** Fetch a route's `__data.json` and return its decoded page payload. */
export async function routeData(route) {
  const path = (route === '/' ? '' : route.replace(/\/$/, '')) + '/__data.json';
  const json = await fetchJson(path);
  const D = json && dataNode(json);
  if (!D) throw new Error(`${path}: no data node (site layout changed?)`);
  return resolveFlat(D, 0);
}

/**
 * Normalise a "players" payload to an array of row objects. darko.app serves it
 * either as an array of objects, or column-oriented as {keys:[…], values:[col…]}.
 */
export function playerRows(players) {
  if (Array.isArray(players)) return players;
  if (players && Array.isArray(players.keys) && Array.isArray(players.values)) {
    const { keys, values } = players;
    const n = Math.max(0, ...values.map((c) => (Array.isArray(c) ? c.length : 0)));
    const rows = [];
    for (let r = 0; r < n; r++) {
      const o = {};
      keys.forEach((k, c) => { o[k] = values[c]?.[r]; });
      rows.push(o);
    }
    return rows;
  }
  throw new Error('unrecognised players payload shape');
}

/**
 * One player's page: `{ info, history }`. `info` is the 79-field playerInfo
 * record; `history` is the per-game DPM history as row objects. Only the parts
 * requested are decoded (the full payload is large).
 */
export async function fetchPlayer(id, { history = false } = {}) {
  const json = await fetchJson(`/player/${id}/__data.json`);
  const D = json && dataNode(json);
  if (!D || !D[0] || typeof D[0] !== 'object') return null;
  const root = D[0];
  const out = { info: root.playerInfo != null ? resolveFlat(D, root.playerInfo) : null, history: null };
  if (history && root.history != null) out.history = playerRows(resolveFlat(D, root.history));
  return out;
}

/** Run `fn` over `items` with bounded concurrency; results keep input order. */
export async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}
