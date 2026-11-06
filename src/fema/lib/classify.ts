// Relevance engine: does this solicitation buy FEMA Public Assistance work?
//
// Sources hand us thin text — on SAM.gov often just a title, an agency and a
// NAICS code — so the engine reads short strings well and explains itself.
// Every rule that fires is reported back as a `matched` label, and the page
// shows them, so a read can always be checked by eye.
//
// A score has two halves, and the strong reads need both:
//   * CONTEXT — is this tied to a federally declared disaster? (FEMA, Stafford
//     Act, DR-4834, "hurricane", 2 CFR 200 …)
//   * WORK    — is it the kind of work PA pays for? (debris removal, debris
//     monitoring, PA consulting, emergency protective measures, repairs …)
// When both are present the read gets a corroboration bonus. "Road repairs"
// alone is noise; "Hurricane Helene road repairs" is a lead.
//
// Then come the traps, because the vocabulary overlaps with other markets:
//   * "public assistance" is also the welfare system (SNAP, TANF, Medicaid).
//   * "disaster recovery" is also IT backup (DRaaS, failover sites).
//   * "storm" is also stormwater, which is utility work, not disaster work.
import type { Category, Tier } from '../types';

export interface ClassifyInput {
  title: string;
  summary?: string;
  agency?: string;
  naics?: string;
}

export interface Classification {
  score: number;
  tier: Tier | null;  // null = below the bar; the scanner drops it
  categories: Category[];
  matched: string[];
  disasterNumbers: number[];
}

type Kind = 'context' | 'work' | 'negative';

interface Rule {
  re: RegExp;
  weight: number;
  label: string;
  kind: Kind;
  category?: Category;
}

// "storm" that is not stormwater / storm drain / storm sewer.
const STORM = String.raw`storms?(?!\s*-?\s*(?:water|drain|sewer|pipe|inlet))`;
const HAZARD = String.raw`(?:hurricane|tropical storm|tornado(?:es)?|flood(?:s|ing)?|wildfires?|winter ${STORM}|ice ${STORM}|severe ${STORM}|derecho|${STORM})`;

const RULES: Rule[] = [
  // ---------------- context: tied to a federal disaster ----------------
  { kind: 'context', weight: 30, label: 'FEMA', re: /\bfema\b/ },
  { kind: 'context', weight: 25, label: 'Public Assistance', re: /\bpublic assistance\b/ },
  { kind: 'context', weight: 25, label: 'Stafford Act', re: /\bstafford act\b/ },
  { kind: 'context', weight: 20, label: 'declared disaster', re: /\b(?:federally|presidentially)[-\s]declared\b|\b(?:major )?disaster declaration\b/ },
  { kind: 'context', weight: 20, label: 'project worksheet', re: /\bproject worksheets?\b/ },
  { kind: 'context', weight: 15, label: 'FEMA work category', re: /\bcategor(?:y|ies) [a-g](?:\b|\s*(?:and|&|-|,)\s*[a-g]\b)/ },
  { kind: 'context', weight: 12, label: '2 CFR 200', re: /\b2\s*c\.?f\.?r\.?\s*(?:part\s*|§\s*)?200\b/ },
  { kind: 'context', weight: 10, label: 'disaster', re: /\bdisasters?\b/ },
  { kind: 'context', weight: 10, label: 'named hazard', re: new RegExp(String.raw`\b${HAZARD}\b`) },
  { kind: 'context', weight: 5, label: 'recovery', re: /\brecovery\b/ },
  { kind: 'context', weight: 4, label: 'emergency', re: /\bemergenc(?:y|ies)\b/ },

  // ---------------- work: Category A — debris ----------------
  { kind: 'work', category: 'debris-monitoring', weight: 40, label: 'debris monitoring', re: /\bdebris (?:removal )?monitor(?:ing|s)?\b/ },
  { kind: 'work', category: 'debris-monitoring', weight: 15, label: 'load tickets / tower monitors', re: /\bload tickets?\b|\btower monitors?\b/ },
  { kind: 'work', category: 'debris-removal', weight: 35, label: 'debris removal', re: /\bdebris (?:removal|collection|hauling|clean-?up|management|reduction|disposal|pickup)\b/ },
  { kind: 'work', category: 'debris-removal', weight: 30, label: 'disaster debris', re: /\b(?:vegetative|c\s*&\s*d|construction (?:and|&) demolition|storm|hurricane|disaster|woody|marine|waterway|flood) debris\b/ },
  { kind: 'work', category: 'debris-removal', weight: 25, label: 'hazardous trees / leaners & hangers', re: /\bhazardous (?:trees?|limbs?|stumps?)\b|\bleaners?\s*(?:and|&|\/)\s*hangers?\b|\bhangers?\s*(?:and|&|\/)\s*leaners?\b/ },
  { kind: 'work', category: 'debris-removal', weight: 20, label: 'derelict / sunken vessels', re: /\b(?:derelict|sunken|displaced) (?:vessels?|boats?)\b/ },
  { kind: 'work', category: 'debris-removal', weight: 12, label: 'debris', re: /\bdebris\b/ },

  // ---------------- work: PA consulting & grant management ----------------
  { kind: 'work', category: 'pa-consulting', weight: 35, label: 'PA consulting / program management', re: /\b(?:public assistance|pa) (?:grant )?(?:consult\w*|program management|grant management|management|administration|support|technical assistance)\b/ },
  { kind: 'work', category: 'pa-consulting', weight: 30, label: 'disaster recovery consulting', re: /\b(?:disaster(?: recovery)?|fema|recovery) (?:grant )?(?:consult\w*|grant management|grants? administration|program management|management services|advisory|technical assistance)\b/ },
  { kind: 'work', category: 'pa-consulting', weight: 20, label: 'cost recovery', re: /\b(?:disaster |fema |emergency )?cost recovery\b/ },
  { kind: 'work', category: 'pa-consulting', weight: 12, label: 'grant management', re: /\bgrants? (?:management|administration)\b/ },
  { kind: 'work', category: 'pa-consulting', weight: 10, label: 'reimbursement', re: /\breimburse(?:ment|able)\b/ },
  { kind: 'work', category: 'pa-consulting', weight: 8, label: 'closeout', re: /\bclose-?out\b/ },

  // ---------------- work: Category B — emergency protective measures ----------------
  { kind: 'work', category: 'emergency-measures', weight: 35, label: 'emergency protective measures', re: /\bemergency protective measures?\b/ },
  { kind: 'work', category: 'emergency-measures', weight: 14, label: 'pre-positioned / standby contract', re: /\bpre-?positioned\b|\b(?:standby|on-call|stand-by) (?:disaster|emergency|debris)\b|\b(?:disaster|emergency) (?:standby|on-call)\b/ },
  { kind: 'work', category: 'emergency-measures', weight: 12, label: 'temporary power / sheltering', re: /\b(?:emergency|temporary) (?:power|sheltering|shelters?|housing)\b|\btemporary (?:generators?|facilities)\b|\bnon-congregate shelter/ },
  // ("Emergency generator" alone is building equipment — maintenance work, not disaster work.)
  { kind: 'work', category: 'emergency-measures', weight: 10, label: 'sandbagging / flood fighting', re: /\bsandbag\w*\b|\bflood fight\w*\b/ },

  // ---------------- work: Categories C–G — permanent work ----------------
  { kind: 'work', category: 'permanent-work', weight: 25, label: 'disaster damage repair', re: new RegExp(String.raw`\b(?:${HAZARD}|disaster|fema|dr-?\d{4})\b.{0,40}\b(?:repairs?|restoration|reconstruction|rebuild\w*|replacement)\b`) },
  { kind: 'work', category: 'permanent-work', weight: 12, label: 'damage repair', re: /\bdamage(?:d)? (?:repairs?|restoration|reconstruction)\b|\brepair of (?:storm|hurricane|flood)[-\s]damage/ },
  { kind: 'work', category: 'permanent-work', weight: 8, label: 'infrastructure repair', re: /\b(?:road|roadway|bridge|culvert|seawall|bulkhead|levee|dune|beach|shoreline|dock|pier|park) (?:repairs?|restoration|renourishment|reconstruction|stabilization)\b/ },

  // ---------------- work: engineering & assessment ----------------
  { kind: 'work', category: 'engineering', weight: 20, label: 'damage assessment', re: /\bdamage assessments?\b|\bpreliminary damage\b|\bsubstantial damage (?:determinations?|inspections?)\b/ },
  { kind: 'work', category: 'engineering', weight: 15, label: 'disaster engineering / inspection', re: /\b(?:disaster|post-?(?:storm|disaster|event))\b.{0,20}\b(?:engineering|inspections?|architect\w*)\b/ },

  // ---------------- work: mitigation (adjacent to PA) ----------------
  { kind: 'work', category: 'mitigation', weight: 15, label: 'hazard mitigation', re: /\bhazard mitigation\b|\bhmgp\b|\bsection 40[46]\b|\b40[46] mitigation\b|\bbric\b/ },

  // ---------------- traps ----------------
  { kind: 'negative', weight: -45, label: 'IT disaster recovery (not PA)', re: /\bdraas\b|\bdisaster recovery (?:as a service|software|sites?|backup|solutions? for (?:it|data)|services? for (?:it|data|servers?))\b|\b(?:data|it|backup|server|network|cloud)\b.{0,25}\bdisaster recovery\b|\bbusiness continuity\b/ },
  // Routine right-of-way upkeep: DOT mowing contracts say "litter/debris
  // removal" in every title (NC eVP posts dozens), and none of it is disaster work.
  { kind: 'negative', weight: -60, label: 'routine litter / mowing (not PA)', re: /\blitter\b|\bmowing\b|\bvegetation (?:management|maintenance|control)\b|\bjanitorial\b|\bstreet sweeping\b/ },
  { kind: 'negative', weight: -15, label: 'flood insurance (NFIP)', re: /\bflood insurance\b|\bnfip\b/ },
  { kind: 'negative', weight: -10, label: 'software / licensing', re: /\bsoftware\b|\bsaas\b|\blicens(?:e|es|ing)\b|\bsubscriptions?\b/ },
  { kind: 'negative', weight: -8, label: 'training / exercise', re: /\btraining\b|\btabletop\b|\bexercises?\b|\bconference\b|\bcurriculum\b/ },
];

/** "Public assistance" in the welfare sense: SNAP, TANF, Medicaid eligibility… */
const WELFARE = /\bsnap\b|\btanf\b|\bmedicaid\b|\bwelfare\b|\bfood stamps?\b|\beligibility (?:determination|system|workers?)\b|\bchild support\b|\bsocial services\b|\bebt\b/;

const PA_CATEGORY_CONTEXT = /\bfema\b|\bpublic assistance\b|\bdebris\b|\bemergency protective\b|\bpermanent work\b|\bdisasters?\b|\bstafford\b/;

/** NAICS codes that lean toward PA work when the text already says disaster. */
const NAICS_HINTS: Record<string, { weight: number; category: Category; label: string }> = {
  '562119': { weight: 10, category: 'debris-removal', label: 'NAICS 562119 (waste collection)' },
  '562111': { weight: 5, category: 'debris-removal', label: 'NAICS 562111 (solid waste collection)' },
  '562219': { weight: 5, category: 'debris-removal', label: 'NAICS 562219 (waste disposal)' },
  '541611': { weight: 5, category: 'pa-consulting', label: 'NAICS 541611 (management consulting)' },
  '541618': { weight: 5, category: 'pa-consulting', label: 'NAICS 541618 (consulting)' },
  '541330': { weight: 4, category: 'engineering', label: 'NAICS 541330 (engineering)' },
  '561990': { weight: 3, category: 'emergency-measures', label: 'NAICS 561990 (support services)' },
};

export const CORE_MIN = 60;
export const LIKELY_MIN = 35;
export const KEEP_MIN = 15;
const BOTH_BONUS = 15;
const DISASTER_NUMBER_WEIGHT = 30;
/** Text with no disaster context at all is capped below "core". */
const NO_CONTEXT_CAP = LIKELY_MIN + 15;
/** Mitigation is adjacent to PA, not PA; on its own it never ranks above "adjacent". */
const MITIGATION_ONLY_CAP = LIKELY_MIN - 1;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FEMA disaster/emergency numbers named in the text (DR-4834, FEMA-4834-DR, EM-3600 …). */
export function extractDisasterNumbers(text: string): number[] {
  const t = normalize(text);
  const found = new Set<number>();
  for (const m of t.matchAll(/\b(?:dr|em)[-\s#]?(\d{4})\b/g)) found.add(Number(m[1]));
  for (const m of t.matchAll(/\b(\d{4})[-\s](?:dr|em)\b/g)) found.add(Number(m[1]));
  // Mitigation project numbers lead with the disaster: "HMGP 4827-0051" is
  // project 51 under DR-4827. Read them only where the text says HMGP/PW.
  if (/\bhmgp\b|\bhazard mitigation grant\b|\bproject worksheet\b|\bpw\b/.test(t)) {
    for (const m of t.matchAll(/\b([1-5]\d{3})-\d{4}\b/g)) found.add(Number(m[1]));
  }
  // FEMA numbers DR 1000+ and EM 3000+; four digits that start 19/20 next to
  // "dr" are far more likely a year in a stray abbreviation than a disaster,
  // but real numbers in the 4000s and 3000s never collide with years.
  return [...found].filter((n) => n >= 1000 && !(n >= 1900 && n <= 2099)).sort((a, b) => a - b);
}

export function tierFor(score: number): Tier | null {
  if (score >= CORE_MIN) return 'core';
  if (score >= LIKELY_MIN) return 'likely';
  if (score >= KEEP_MIN) return 'adjacent';
  return null;
}

export function classify(input: ClassifyInput): Classification {
  const text = normalize([input.title, input.summary ?? '', input.agency ?? ''].join(' \n '));
  const matched: string[] = [];
  const cats = new Map<Category, number>();
  let context = 0;
  let work = 0;
  let negative = 0;

  // A disaster number is the single strongest tie to a declaration.
  const disasterNumbers = extractDisasterNumbers(text);
  if (disasterNumbers.length) {
    context += DISASTER_NUMBER_WEIGHT;
    matched.push(`disaster ${disasterNumbers.map((n) => `#${n}`).join(', ')}`);
  }

  const welfare = WELFARE.test(text);
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    // Welfare "public assistance" is a different program. Without a FEMA or
    // disaster cue elsewhere it earns nothing, and it costs the read.
    if (rule.label === 'Public Assistance' && welfare && !/\bfema\b|\bdisasters?\b|\bstafford\b/.test(text)) {
      negative -= 20;
      matched.push('welfare "public assistance" (not FEMA)');
      continue;
    }
    // "Category A".."G" is everywhere in procurement (commodity classes, lot
    // categories). It is FEMA's only when the text is already about PA work.
    if (rule.label === 'FEMA work category' && !PA_CATEGORY_CONTEXT.test(text)) continue;
    if (rule.kind === 'context') context += rule.weight;
    else if (rule.kind === 'work') work += rule.weight;
    else negative += rule.weight;
    if (rule.category) cats.set(rule.category, (cats.get(rule.category) ?? 0) + rule.weight);
    matched.push(rule.label);
  }

  const hint = input.naics ? NAICS_HINTS[input.naics.trim()] : undefined;
  if (hint && context + work > 0) {
    work += hint.weight;
    cats.set(hint.category, (cats.get(hint.category) ?? 0) + hint.weight);
    matched.push(hint.label);
  }

  let score = context + work + negative;
  if (context >= 10 && work >= 10) score += BOTH_BONUS;
  if (context === 0) score = Math.min(score, NO_CONTEXT_CAP);

  // Ranked by how much each category contributed, strongest first.
  const categories = [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  if (categories.length === 1 && categories[0] === 'mitigation') score = Math.min(score, MITIGATION_ONLY_CAP);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    tier: tierFor(score),
    categories,
    matched,
    disasterNumbers,
  };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  'debris-removal': 'Debris removal',
  'debris-monitoring': 'Debris monitoring',
  'pa-consulting': 'PA consulting',
  'emergency-measures': 'Emergency measures',
  'permanent-work': 'Permanent work',
  engineering: 'Engineering',
  mitigation: 'Mitigation',
};

export const TIER_LABEL: Record<Tier, string> = {
  core: 'Core PA',
  likely: 'Likely PA',
  adjacent: 'Adjacent',
};
