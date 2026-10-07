// Pull DARKO Daily Plus-Minus (DPM) projections from darko.app and write
// src/data/seededDarko.ts. Runs in CI.  DPM = total, O-DPM = offense, D-DPM = defense.
//
// Sources (see scripts/lib/darko-data.mjs for how darko.app serves them):
//   • /scatterplot + / (bulk, 2 requests): DPM family, projected box line, age,
//     market value, salary, rank — refreshed on every run.
//   • /player/{id} (one request each): the slow-moving fields the bulk routes
//     don't carry — position archetype (x_position/position_num), the s1..s15
//     value-retention (aging) curve, rookie season, projected retirement age.
//     Refetched for everyone on a "full" run (weekly + manual + on push), and
//     otherwise only for players whose previous seed record is missing them.
//
// Safety: every guard below throws BEFORE anything is written, so a degraded or
// reshaped feed fails the job loudly instead of overwriting good data.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { routeData, playerRows, fetchPlayer, mapPool, sleep } from './lib/darko-data.mjs';

const FULL = process.env.DARKO_FULL === 'true' || process.argv.includes('--full');
const SEED_PATH = 'src/data/seededDarko.ts';
const STALE_KEEP_DAYS = 120; // keep a dropped player's last-known line this long

// Normalize a player name for joining across sources (strip accents/punctuation).
const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rnd = (n, d) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const f2 = (n) => rnd(n, 2);
const r3 = (n) => rnd(n, 3);
// Dollars → millions, 1 decimal (e.g. 94052625 → 94.1).
const fM = (n) => (n == null ? null : Math.round(n / 1e5) / 10);
const pct = (x, tot) => `${tot ? Math.round((x / tot) * 100) : 0}%`;

console.log(`Pulling DARKO from darko.app… (${FULL ? 'FULL' : 'daily'} run)`);

// ---- previous seed (carry-forward + regression guard) -----------------------
let prev = {};
if (existsSync(SEED_PATH)) {
  const m = readFileSync(SEED_PATH, 'utf8').match(/SEEDED_DARKO[^=]*=\s*(\{[\s\S]*\});\s*$/);
  if (m) prev = JSON.parse(m[1]);
}
const prevCount = Object.values(prev).filter((p) => !p.stale).length;
console.log(`  previous seed: ${Object.keys(prev).length} players (${prevCount} live)`);

// ---- bulk pull ---------------------------------------------------------------
const [home, scatter] = await Promise.all([routeData('/'), routeData('/scatterplot')]);
const homeRows = playerRows(home.players);
const scatRows = playerRows(scatter.players);
console.log(`  / rows ${homeRows.length} · /scatterplot rows ${scatRows.length}`);
console.log(`  / fields: ${Object.keys(homeRows[0] ?? {}).join(' ')}`);
console.log(`  /scatterplot fields: ${Object.keys(scatRows[0] ?? {}).join(' ')}`);
if (scatRows.length < 300) throw new Error(`only ${scatRows.length} players on /scatterplot — site layout likely changed`);

const keyOf = (r) => (r.nba_id != null ? String(r.nba_id) : norm(String(r.player_name ?? '')));
const merged = new Map();
for (const r of homeRows) if (r.player_name) merged.set(keyOf(r), { ...r });
for (const r of scatRows) if (r.player_name) merged.set(keyOf(r), { ...(merged.get(keyOf(r)) ?? {}), ...r });
const bulk = [...merged.values()].filter((r) => num(r.dpm) != null);
console.log(`  merged ${bulk.length} players with a DPM`);

const boxFilled = bulk.filter((r) => num(r.x_blk_100) != null && num(r.x_orb_100) != null).length;
console.log(`  bulk completeness — projected box ${pct(boxFilled, bulk.length)}`);
if (bulk.length < 300) throw new Error(`only ${bulk.length} players with a DPM — layout likely changed`);
if (boxFilled / bulk.length < 0.9) throw new Error(`projected box line only ${pct(boxFilled, bulk.length)} populated — refusing to overwrite`);
if (prevCount && bulk.length < 0.7 * prevCount) throw new Error(`player count fell ${prevCount} → ${bulk.length} — refusing to overwrite`);

// ---- per-player slow fields -------------------------------------------------
const slowOf = (rec) =>
  rec && rec.xpos != null && rec.rookieSeason != null && rec.retirementAge != null && rec.decline?.some((x) => x != null);
const todo = bulk.filter((r) => FULL || !slowOf(prev[norm(r.player_name)]));
console.log(`  per-player pulls: ${todo.length} of ${bulk.length}`);
const infoById = new Map();
let failed = 0;
await mapPool(todo, 6, async (r) => {
  try {
    const p = await fetchPlayer(r.nba_id);
    if (p?.info) infoById.set(String(r.nba_id), p.info);
    else failed++;
  } catch {
    failed++;
  }
  await sleep(30);
});
console.log(`  per-player: ${infoById.size} ok · ${failed} failed`);

// ---- assemble ---------------------------------------------------------------
const decl = (info) => {
  const out = [];
  for (let i = 1; i <= 15; i++) out.push(r3(num(info?.[`s${i}`])));
  return out;
};
const out = {};
let liveCount = 0;
for (const r of bulk.sort((a, b) => b.dpm - a.dpm)) {
  const key = norm(String(r.player_name));
  if (key in out) continue;
  const old = prev[key];
  const info = infoById.get(String(r.nba_id));
  const orb = num(r.x_orb_100), drb = num(r.x_drb_100);
  // Slow fields: fresh if we fetched them, else carried from the previous seed.
  const slow = info
    ? {
        xpos: info.x_position ?? null,
        posNum: f2(num(info.position_num)),
        rookieSeason: num(info.rookie_season),
        retirementAge: rnd(num(info.x_retirement_age), 1),
        decline: decl(info),
      }
    : {
        xpos: old?.xpos ?? null,
        posNum: old?.posNum ?? null,
        rookieSeason: old?.rookieSeason ?? null,
        retirementAge: old?.retirementAge ?? null,
        decline: old?.decline ?? Array(15).fill(null),
      };
  out[key] = {
    id: num(r.nba_id),
    name: String(r.player_name),
    dpm: f2(num(r.dpm)),
    odpm: f2(num(r.o_dpm)),
    ddpm: f2(num(r.d_dpm)),
    salary: fM(num(r.actual_salary) ?? num(info?.actual_salary)),
    value: fM(num(r.sal_market_fixed)),
    surplus: fM(num(r.surplus_value)),
    rank: num(r._rank) ?? num(r.rank) ?? null,
    age: rnd(num(r.age) ?? num(info?.age), 1),
    pos: r.position ?? null,
    xpos: slow.xpos,
    posNum: slow.posNum,
    min: rnd(num(r.x_minutes), 1),
    rookieSeason: slow.rookieSeason,
    retirementAge: slow.retirementAge,
    box:
      num(r.x_pts_100) == null
        ? null
        : {
            pts: r3(num(r.x_pts_100)), ast: r3(num(r.x_ast_100)), reb: r3((orb ?? 0) + (drb ?? 0)),
            orb: r3(orb), drb: r3(drb), stl: r3(num(r.x_stl_100)), blk: r3(num(r.x_blk_100)),
            tov: r3(num(r.x_tov_100)), fga: r3(num(r.x_fga_100)), fg3a: r3(num(r.x_fg3a_100)),
            fta: r3(num(r.x_fta_100)), fgpct: r3(num(r.x_fg_pct)), fg3pct: r3(num(r.x_fg3_pct)),
            ftpct: r3(num(r.x_ft_pct)),
          },
    decline: slow.decline,
  };
  liveCount++;
}

// Slow-field coverage guard (after fetch + carry-forward).
const live = Object.values(out);
const xposOk = live.filter((p) => p.xpos).length;
const agingOk = live.filter((p) => p.decline.some((x) => x != null)).length;
console.log(`  coverage — xpos ${pct(xposOk, live.length)} · aging curve ${pct(agingOk, live.length)} · rookie ${pct(live.filter((p) => p.rookieSeason != null).length, live.length)} · retirement ${pct(live.filter((p) => p.retirementAge != null).length, live.length)}`);
if (xposOk / live.length < 0.8 || agingOk / live.length < 0.8) {
  throw new Error(`position/aging coverage too low (xpos ${pct(xposOk, live.length)}, aging ${pct(agingOk, live.length)}) — refusing to overwrite`);
}

// Players DARKO no longer lists (e.g. unsigned free agents): keep the last-known
// line, flagged stale, for STALE_KEEP_DAYS so the free-agent pool doesn't empty out.
const today = new Date().toISOString().slice(0, 10);
const dropped = [];
let kept = 0;
for (const [key, old] of Object.entries(prev)) {
  if (key in out) continue;
  const since = old.staleSince ?? today;
  const ageDays = (Date.parse(today) - Date.parse(since)) / 86_400_000;
  dropped.push(old.name);
  if (ageDays <= STALE_KEEP_DAYS) {
    out[key] = { ...old, stale: true, staleSince: since };
    kept++;
  }
}
console.log(`  dropped from DARKO since last seed: ${dropped.length} (kept stale ${kept}): ${dropped.slice(0, 60).join(', ')}${dropped.length > 60 ? ', …' : ''}`);

// ---- write ------------------------------------------------------------------
const rowDates = scatRows.map((r) => r.date).filter(Boolean).sort();
const meta = {
  asOf: (typeof home.asOf === 'string' && home.asOf) || rowDates[rowDates.length - 1] || null,
  ratingsThrough: typeof home.ratingsThrough === 'string' ? home.ratingsThrough : null,
  pulledAt: new Date().toISOString(),
  mode: FULL ? 'full' : 'daily',
  players: liveCount,
};
console.log(`  top 5 by DPM: ${live.slice(0, 5).map((p) => `${p.name} ${p.dpm}`).join(', ')}`);
console.log(`  meta: ${JSON.stringify(meta)}`);

writeFileSync(
  SEED_PATH,
  `// AUTO-GENERATED DARKO Daily Plus-Minus (DPM) from darko.app.\n` +
    `// Regenerate: node scripts/build-darko.mjs [--full]\n` +
    `export interface DarkoBox { pts: number | null; ast: number | null; reb: number | null; orb: number | null; drb: number | null; stl: number | null; blk: number | null; tov: number | null; fga: number | null; fg3a: number | null; fta: number | null; fgpct: number | null; fg3pct: number | null; ftpct: number | null; }\n` +
    `export interface DarkoInfo { id?: number | null; name: string; dpm: number; odpm: number | null; ddpm: number | null; salary: number | null; value: number | null; surplus: number | null; rank: number | null; age: number | null; pos: string | null; xpos: string | null; posNum: number | null; min: number | null; rookieSeason: number | null; retirementAge: number | null; box: DarkoBox | null; decline: (number | null)[]; stale?: boolean; staleSince?: string; }\n` +
    `export interface DarkoMeta { asOf: string | null; ratingsThrough: string | null; pulledAt: string; mode: string; players: number; }\n\n` +
    `// When the DARKO projections are dated, and when we last pulled them.\n` +
    `export const DARKO_META: DarkoMeta = ${JSON.stringify(meta)};\n\n` +
    `// Keyed by normalized player name (lowercase, no accents/punctuation).\n` +
    `export const SEEDED_DARKO: Record<string, DarkoInfo> = ${JSON.stringify(out, null, 0)};\n`
);
console.log(`\nWrote ${SEED_PATH} (${Object.keys(out).length} players: ${liveCount} live + ${kept} stale).`);
