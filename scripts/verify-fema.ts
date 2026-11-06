// Headless checks for the FEMA PA relevance engine and the feed parser. Run:
//   npm run verify:fema
// Each case is a real-world title shape; the traps are the ones that matter
// most, because the vocabulary of PA work overlaps three other markets.
import { classify, extractDisasterNumbers, tierFor } from '../src/fema/lib/classify';
import { parseFeed, findDueDate } from './fema/sources/rss';
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

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
