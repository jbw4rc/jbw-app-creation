// Throwaway: find darko.app's DPM data endpoint by inspecting its JS bundle.
import { writeFileSync } from 'fs';
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: '*/*',
};
let LOG = '';
const log = (s) => { LOG += s + '\n'; console.log(s); };
const get = async (u) => (await fetch(u, { headers: HEADERS })).text();

const html = await get('https://darko.app/');
log(`index.html ${html.length.toLocaleString()} bytes · "dpm" occurrences: ${(html.match(/dpm/gi) || []).length}`);

// Inline JSON island? Dump any large <script>...</script> that mentions dpm/player.
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
scripts.forEach((s, i) => {
  const attrs = s[1]; const inner = s[2];
  const src = (attrs.match(/src="([^"]+)"/) || [])[1];
  if (src) log(`  script[${i}] src=${src}`);
  else if (inner.length > 500) log(`  script[${i}] inline ${inner.length}b · has dpm=${/dpm/i.test(inner)} · sample: ${inner.slice(0, 160).replace(/\s+/g, ' ')}`);
});

// Fetch JS assets and hunt for data endpoints.
const assetUrls = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]).map((u) => (u.startsWith('http') ? u : 'https://darko.app' + (u.startsWith('/') ? u : '/' + u)));
log(`\nJS assets: ${assetUrls.length}`);
for (const u of assetUrls.slice(0, 4)) {
  try {
    const js = await get(u);
    log(`\n== ${u} (${js.length.toLocaleString()}b) ==`);
    const urls = [...new Set((js.match(/["'`]([^"'`]*(supabase|firebase|amazonaws|storage\.googleapis|\.json|\.csv|\/rest\/|\/api\/|sheets|dpm|darko)[^"'`]*)["'`]/gi) || []).map((m) => m.slice(1, -1)))]
      .filter((s) => s.length < 200).slice(0, 25);
    urls.forEach((x) => log('   ' + x));
    const sheet = js.match(/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
    if (sheet) log('   GOOGLE SHEET: ' + sheet[1]);
    const supa = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
    if (supa) log('   SUPABASE: ' + supa[0]);
  } catch (e) {
    log(`  ${u} ERROR ${e.message}`);
  }
}
writeFileSync('darko-debug.txt', LOG);
console.log('done');
