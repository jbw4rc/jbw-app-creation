import type { Opportunity } from '../../../src/fema/types.ts';

/** What a source adapter returns: an opportunity before classification and bookkeeping. */
export type RawOpportunity = Omit<Opportunity, 'score' | 'tier' | 'categories' | 'matched' | 'disasterNumbers' | 'firstSeen' | 'lastSeen'>;
