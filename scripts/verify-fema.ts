// Headless checks for the FEMA PA relevance engine and the feed parser. Run:
//   npm run verify:fema
// Each case is a real-world title shape; the traps are the ones that matter
// most, because the vocabulary of PA work overlaps three other markets.
import { classify, extractDisasterNumbers, tierFor } from '../src/fema/lib/classify';
import { parseFeed, findDueDate } from './fema/sources/rss';
import { parseDeptListing } from './fema/sources/lapac';
import { recordToRaw } from './fema/sources/ncevp';
import { parseCsv, rowsToRaw } from './fema/sources/imports';
import { usDate } from './fema/sources/http';
import { readFileSync } from 'node:fs';
import type { Tier } from '../src/fema/types';

let failures = 0;
const check = (name: string, pass: boolean, extra = '') => {
  console.log(`${pass ? '  ok  ' : '  FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!pass) failures++;
};

const expectTier = (title: string, want: Tier | null, extra: { summary?: string; naics?: string } = {}) => {
  const c = classify({ title, ...extra });
  check(`${want ?? 'dropped'}: ${title}`, c.tier === want, `score ${c.score} [${c.matched.join('; ')}]`);
  return c;
};

console.log('\n— core PA work —');
expectTier('FEMA Public Assistance Consulting Services', 'core');
expectTier('Disaster Debris Removal Services', 'core');
expectTier('Debris Monitoring Services – Hurricane Milton', 'core');
expectTier('Hurricane Helene Road Repairs (FEMA DR-4827)', 'core');
expectTier('Emergency Protective Measures, Category B', 'core');
expectTier('Disaster Recovery Grant Management Services', 'core');

console.log('\n— likely / adjacent —');
expectTier('Debris Monitoring Services', 'likely');
expectTier('Vegetative Debris Grinding and Hauling', 'likely');
expectTier('Hazard Mitigation Plan Update', 'adjacent');
expectTier('Post-Storm Engineering Inspections', 'likely');

console.log('\n— traps —');
expectTier('Disaster Recovery as a Service (DRaaS)', null);
expectTier('IT Backup and Disaster Recovery Solution', null);
expectTier('Public Assistance Eligibility System Modernization – SNAP/TANF', null);
expectTier('Stormwater Pipe Repairs', null);
expectTier('Storm Drain Cleaning', null);
expectTier('Road Repairs on County Route 9', null);
expectTier('Flood Insurance Rate Study (NFIP)', null);
expectTier('Janitorial Services', null);
expectTier('Emergency Generator Maintenance', null);

console.log('\n— seen on live state portals (Nov 2026) —');
expectTier('RFP for On-Call FEMA Advisory Services', 'core');
expectTier('REQUEST FOR PROPOSALS: EMERGENCY DEBRIS MONITORING SERVICES', 'likely');
expectTier('POST-DISASTER DAMAGE ASSESSMENTS FOR THE JEFFERSON PARISH DEPARTMENT OF INSPECTION AND CODE ENFORCEMENT', 'likely');
expectTier('STATE ROUTE SHOULDER AND MEDIAN MOWING INCLUDING VEGETATION TRIMMING AND LITTER/DEBRIS REMOVAL', null);
expectTier('50-2627012 Musical Instruments and Related Accessories IFB Sourcing Event', null, { summary: 'Category A: brass. Category B: percussion.' });
expectTier('Helios Lift Station Generator, FEMA HMGP Project No. 4611', 'adjacent');

console.log('\n— welfare wording does not sink a real PA posting —');
expectTier('FEMA Public Assistance Program Management', 'core', { summary: 'Includes eligibility determination support for PA applicants.' });

console.log('\n— NAICS hints only count with a disaster/work cue —');
check('NAICS 562119 alone scores nothing', classify({ title: 'Container Rental', naics: '562119' }).score === 0);
check(
  'NAICS 562119 lifts a debris title',
  classify({ title: 'Debris Hauling', naics: '562119' }).score > classify({ title: 'Debris Hauling' }).score
);

console.log('\n— disaster numbers —');
const nums = (s: string) => extractDisasterNumbers(s).join(',');
check('DR-4827', nums('Repairs under DR-4827') === '4827');
check('FEMA-4834-DR-FL', nums('FEMA-4834-DR-FL debris') === '4834');
check('EM-3615 and DR 4799', nums('EM-3615 and DR 4799') === '3615,4799');
check('HMGP project numbers name their disaster', nums('Hazard Mitigation Grant Program (HMGP) 4827-0051 Town of Belhaven') === '4827');
check('bare ####-#### is not a disaster', nums('Bid 4827-0051 office chairs') === '');
check('years are not disasters', nums('Project DR 2026 update') === '');
check('a disaster number earns context', classify({ title: 'Debris removal DR-4827' }).score >= 60);

console.log('\n— tiers —');
check('tier bands', tierFor(60) === 'core' && tierFor(59) === 'likely' && tierFor(35) === 'likely' && tierFor(34) === 'adjacent' && tierFor(14) === null);

console.log('\n— feed parsing —');
const rss = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[RFP 26-09 Disaster Debris Removal & Monitoring]]></title>
<link>https://example.gov/Bids.aspx?bidID=9</link>
<description>&lt;p&gt;Closing Date: 12/01/2026 2:00 PM&lt;/p&gt; FEMA reimbursable</description>
<pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><guid>bid-9</guid></item>
<item><title>Office Furniture</title><link>https://example.gov/Bids.aspx?bidID=10</link></item>
</channel></rss>`;
const items = parseFeed(rss, { name: 'Example', url: 'https://example.gov/rss', state: 'FL' });
check('two RSS items parsed', items.length === 2);
check('CDATA + entity title', items[0].title === 'RFP 26-09 Disaster Debris Removal & Monitoring', items[0].title);
check('due date from description', items[0].dueDate?.startsWith('2026-12-01') ?? false, items[0].dueDate);
check('state carried from config', items[0].state === 'FL');
const atom = `<feed><entry><title>Hurricane Debris Removal</title><link href="https://x.gov/b/1"/><id>tag:x,1</id><updated>2026-11-01T00:00:00Z</updated><summary>Bids due November 20, 2026</summary></entry></feed>`;
const a = parseFeed(atom, { name: 'X', url: 'https://x.gov/atom' });
check('atom link href', a[0]?.url === 'https://x.gov/b/1');
check('month-name due date', findDueDate('Bids due November 20, 2026')?.startsWith('2026-11-20') ?? false);

console.log('\n— state portal parsers (trimmed live pages) —');
const lapac = parseDeptListing(readFileSync('scripts/fema/fixtures/lapac-dept.html', 'utf8'));
check('LaPAC rows parsed', lapac.length === 3, String(lapac.length));
check('LaPAC title is the description, not the attachments', lapac[0]?.title === 'DOTD 48" Cold Planer(S42)', lapac[0]?.title);
check('LaPAC agency from header', lapac[0]?.agency === 'Transportation and Development', lapac[0]?.agency);
check('LaPAC posted and due dates', !!lapac[0]?.postedDate && !!lapac[0]?.dueDate, `${lapac[0]?.postedDate} → ${lapac[0]?.dueDate}`);
check('LaPAC links the bid document', /\/osp\/lapac\/agency\/pdf\/\d+\.pdf$/.test(lapac[0]?.url ?? ''), lapac[0]?.url);
const grid = JSON.parse(readFileSync('scripts/fema/fixtures/ncevp-grid.json', 'utf8'));
const nc = grid.Records.map(recordToRaw).filter(Boolean);
check('eVP open records parsed', nc.length >= 3, String(nc.length));
check('eVP agency title-cased', !/^[A-Z\s]+$/.test(nc[0].agency), nc[0].agency);
check('eVP detail link', nc[0].url.startsWith('https://evp.nc.gov/solicitations/details/?id='));
check('eVP due date parsed', !!nc[0].dueDate, nc[0].dueDate);
check(
  'eVP non-open record dropped',
  recordToRaw({ Id: 'x', Attributes: [{ Name: 'statuscode', DisplayValue: 'Canceled' }, { Name: 'evp_name', DisplayValue: 'Debris removal' }] }) === null
);
check('US date + time → ISO', usDate('11/18/2026 2:00 PM') === '2026-11-18T19:00:00.000Z', usDate('11/18/2026 2:00 PM'));

console.log('\n— CSV imports —');
const csv =
  'Solicitation ID,Title,Agency/Texas SmartBuy Member Name,Status,Posting Date,Response Due Date,Response Time,NIGP Codes\n' +
  'RFP-26-01,"Disaster Debris Removal, Monitoring ""Pre-Positioned""",Galveston County - C0840,Posted,10/29/2026,11/20/2026,2:00 PM,"91027-Garbage; 96239-Disaster"\n' +
  'IFB-9,Office Chairs,Hays County - C1050,Posted,10/29/2026,11/21/2026,,\n' +
  'IFB-10,Hurricane Debris Removal,Hays County - C1050,Closed,10/01/2026,10/21/2026,,\n';
const rows = parseCsv(csv);
check('quoted CSV with commas and doubled quotes', rows[1][1] === 'Disaster Debris Removal, Monitoring "Pre-Positioned"', rows[1][1]);
const imp = rowsToRaw(rows, 'TX-esbd-2026-11-06.csv');
check('closed rows skipped', imp.length === 2, String(imp.length));
check('state from file name', imp[0].state === 'TX');
check('agency code suffix trimmed', imp[0].agency === 'Galveston County', imp[0].agency);
check('due date + time joined', imp[0].dueDate === '2026-11-20T19:00:00.000Z', imp[0].dueDate);
check('TX rows link to ESBD', imp[0].url === 'https://www.txsmartbuy.gov/esbd/RFP-26-01', imp[0].url);
check('imported debris row scores as core', classify(imp[0]).tier === 'core', String(classify(imp[0]).score));

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
