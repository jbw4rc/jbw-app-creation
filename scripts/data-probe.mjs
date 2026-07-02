// Feasibility probe: can a GitHub Actions runner reach the stats/salary sources
// we'd need for the data pipeline? Prints a report to the workflow log.
// Run by .github/workflows/data-probe.yml (throwaway — remove once decided).

const SEASON_API = '2025-26'; // most recent completed season
const SEASON_BBREF = '2026'; // BBRef uses the season's end year

const NBA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  Connection: 'keep-alive',
};

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function probe(label, url, headers, kind) {
  const line = '─'.repeat(60);
  console.log(`\n${line}\n▶ ${label}\n  ${url}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const ct = res.headers.get('content-type') || '';
    const body = await res.text();
    console.log(`  status: ${res.status} ${res.statusText}`);
    console.log(`  content-type: ${ct}`);
    console.log(`  bytes: ${body.length.toLocaleString()}`);
    console.log(`  server: ${res.headers.get('server') || '?'}  cf-ray: ${res.headers.get('cf-ray') || '-'}`);

    if (kind === 'json' || ct.includes('json')) {
      try {
        const j = JSON.parse(body);
        const keys = Object.keys(j);
        console.log(`  JSON parsed ✓  top keys: ${keys.join(', ')}`);
        if (j.resultSets?.[0]) {
          const rs = j.resultSets[0];
          console.log(`  resultSet "${rs.name}": ${rs.rowSet?.length ?? 0} rows, ${rs.headers?.length ?? 0} cols`);
          console.log(`  headers: ${(rs.headers || []).slice(0, 12).join(', ')}${(rs.headers || []).length > 12 ? ' …' : ''}`);
          if (rs.rowSet?.[0]) console.log(`  row[0] sample: ${JSON.stringify(rs.rowSet[0].slice(0, 8))}`);
        }
      } catch {
        console.log(`  JSON parse FAILED — first 200 chars: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
      }
    } else {
      const hasNext = body.includes('__NEXT_DATA__');
      const hasApi = /\/api\//.test(body);
      const tables = (body.match(/<table/gi) || []).length;
      console.log(`  html: __NEXT_DATA__=${hasNext}  mentions /api/=${hasApi}  <table> count=${tables}`);
      const nextMatch = body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextMatch) {
        console.log(`  __NEXT_DATA__ length: ${nextMatch[1].length.toLocaleString()} bytes`);
        try {
          const nd = JSON.parse(nextMatch[1]);
          const pageKeys = Object.keys(nd?.props?.pageProps || {});
          console.log(`  pageProps keys: ${pageKeys.join(', ') || '(none)'}`);
          console.log(`  buildId: ${nd.buildId || '?'}`);
        } catch {
          console.log('  __NEXT_DATA__ present but not parseable');
        }
      }
      console.log(`  first 160 chars: ${body.slice(0, 160).replace(/\s+/g, ' ')}`);
    }
  } catch (e) {
    console.log(`  ERROR: ${e.name} — ${e.message}`);
  } finally {
    clearTimeout(t);
  }
}

console.log(`Data-source feasibility probe · season ${SEASON_API} / BBRef ${SEASON_BBREF}`);

// 1) NBA Stats API — advanced box (BPM/TS%/USG% live here)
await probe(
  'NBA Stats API — Advanced player stats',
  `https://stats.nba.com/stats/leaguedashplayerstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&GameSegment=&Height=&LastNGames=0&LeagueID=00&Location=&MeasureType=Advanced&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PaceAdjust=N&PerMode=PerGame&Period=0&PlayerExperience=&PlayerPosition=&PlusMinus=N&Rank=N&Season=${SEASON_API}&SeasonSegment=&SeasonType=Regular+Season&ShotClockRange=&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`,
  NBA_HEADERS,
  'json'
);

// 2) NBA Stats API — tracking (on/off + hustle proxy)
await probe(
  'NBA Stats API — tracking (drives)',
  `https://stats.nba.com/stats/leaguedashptstats?College=&Conference=&Country=&DateFrom=&DateTo=&Division=&DraftPick=&DraftYear=&GameScope=&Height=&LastNGames=0&LeagueID=00&Location=&Month=0&OpponentTeamID=0&Outcome=&PORound=0&PerMode=PerGame&PlayerExperience=&PlayerOrTeam=Player&PlayerPosition=&PtMeasureType=Drives&Season=${SEASON_API}&SeasonSegment=&SeasonType=Regular+Season&StarterBench=&TeamID=0&VsConference=&VsDivision=&Weight=`,
  NBA_HEADERS,
  'json'
);

// 3) Basketball-Reference — advanced table (fallback stats source)
await probe(
  'Basketball-Reference — advanced',
  `https://www.basketball-reference.com/leagues/NBA_${SEASON_BBREF}_advanced.html`,
  BROWSER_HEADERS,
  'html'
);

// 4) SalarySwish — homepage (look for API / __NEXT_DATA__)
await probe('SalarySwish — homepage', 'https://salaryswish.com/', BROWSER_HEADERS, 'html');

// 5) SalarySwish — a team page (structure of the salary data)
await probe(
  'SalarySwish — team page (Nuggets)',
  'https://salaryswish.com/teams/denver-nuggets',
  BROWSER_HEADERS,
  'html'
);

console.log('\n' + '═'.repeat(60) + '\nProbe complete.');
