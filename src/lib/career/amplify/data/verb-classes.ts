/**
 * Curated static data for the résumé amplification engine.
 * Behavior lives in ../primitives.ts and ../rules/*; this file is words only.
 */

import { INPUT_SENTINEL } from './input-sentinel.js';

export { INPUT_SENTINEL };

export type ObjectClass =
  | 'people'
  | 'system'
  | 'process'
  | 'data'
  | 'outcome'
  | 'project';

/** Fixed evaluation order — the first class that matches a token wins. */
export const OBJECT_CLASS_ORDER: readonly ObjectClass[] = [
  'people',
  'system',
  'process',
  'data',
  'outcome',
  'project',
];

export const OBJECT_CLASS_KEYWORDS: Record<ObjectClass, readonly string[]> = {
  people: ['team', 'staff', 'engineer', 'developer', 'client', 'customer', 'intern', 'stakeholder', 'contractor', 'volunteer'],
  system: ['system', 'api', 'service', 'platform', 'pipeline', 'app', 'application', 'website', 'database', 'server', 'integration'],
  process: ['process', 'workflow', 'deployment', 'release', 'onboarding', 'procedure', 'operation', 'rollout'],
  data: ['data', 'dataset', 'report', 'analysis', 'metric', 'dashboard', 'model', 'survey'],
  outcome: ['revenue', 'cost', 'growth', 'retention', 'churn', 'conversion', 'profit', 'sales', 'engagement'],
  project: ['project', 'initiative', 'launch', 'migration', 'campaign', 'rewrite', 'redesign', 'program'],
};

export const CLASS_STRONG_VERB: Record<ObjectClass, string> = {
  people: 'Led',
  system: 'Built',
  process: 'Streamlined',
  data: 'Analyzed',
  outcome: 'Drove',
  project: 'Spearheaded',
};

/**
 * Weak leading verbs eligible for strengthening.
 * `responsible` is deliberately absent: `Responsible for <gerund>` is a construction
 * (see rules/weak-construction.ts), and swapping just the word would produce
 * "Led for managing the team".
 */
export const WEAK_VERBS: ReadonlySet<string> = new Set([
  'helped',
  'worked',
  'did',
  'handled',
  'used',
  'assisted',
  'participated',
  'supported',
  'contributed',
  'aided',
  'performed',
]);

export const STRONG_VERBS: ReadonlySet<string> = new Set([
  'led', 'built', 'streamlined', 'analyzed', 'drove', 'spearheaded',
  'reduced', 'cut', 'increased', 'grew', 'improved', 'saved', 'managed',
  'delivered', 'launched', 'automated', 'designed', 'created', 'developed',
  'engineered', 'implemented', 'owned', 'shipped', 'negotiated', 'trained',
  'migrated', 'authored', 'resolved', 'coordinated',
]);

/** Verbs recognised as verbs for line classification but never rewritten. */
export const KNOWN_VERBS: ReadonlySet<string> = new Set([
  'was', 'were', 'ran', 'wrote', 'oversaw', 'grew', 'won', 'set', 'kept',
  'held', 'took', 'made', 'sold', 'taught', 'spoke', 'drew',
]);

/** After a weak leading verb, these mean the verb governs no direct object. */
export const PREPOSITIONS: ReadonlySet<string> = new Set([
  'on', 'with', 'for', 'in', 'at', 'to', 'from', 'as', 'under',
  'alongside', 'across', 'through', 'within', 'during', 'toward', 'towards',
]);

export type MetricClass = 'reduce' | 'increase' | 'save' | 'team' | 'open';

/** Leading verbs whose accomplishments are measurable — the only quantification triggers. */
export const MEASURABLE_VERB_CLASS: Record<string, MetricClass> = {
  reduced: 'reduce',
  cut: 'reduce',
  increased: 'increase',
  grew: 'increase',
  improved: 'increase',
  saved: 'save',
  managed: 'team',
  led: 'team',
  built: 'open',
  delivered: 'open',
  launched: 'open',
  automated: 'open',
};

export interface MetricTemplate {
  clause: string;
  slots: Array<{ placeholder: string; hint: string }>;
}

/**
 * Every blank is a sentinel with its own slot. The machine never fills one —
 * apply-suggestions.ts refuses to write a suggestion that still contains U+241F.
 */
export const METRIC_TEMPLATES: Record<MetricClass, MetricTemplate> = {
  reduce: {
    clause: `, reducing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}%`,
    slots: [
      { placeholder: 'what you reduced', hint: 'e.g. build time, support tickets' },
      { placeholder: 'percent', hint: 'e.g. 40' },
    ],
  },
  increase: {
    clause: `, increasing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}% (from ${INPUT_SENTINEL} to ${INPUT_SENTINEL})`,
    slots: [
      { placeholder: 'what you increased', hint: 'e.g. weekly active users' },
      { placeholder: 'percent', hint: 'e.g. 32' },
      { placeholder: 'starting value', hint: 'e.g. 12k' },
      { placeholder: 'ending value', hint: 'e.g. 16k' },
    ],
  },
  save: {
    clause: `, saving $${INPUT_SENTINEL}/yr`,
    slots: [{ placeholder: 'amount', hint: 'annual dollars saved, e.g. 120k' }],
  },
  team: {
    clause: `, managing a team of ${INPUT_SENTINEL}`,
    slots: [{ placeholder: 'headcount', hint: 'how many people, e.g. 6' }],
  },
  open: {
    clause: `, ${INPUT_SENTINEL}`,
    slots: [
      {
        placeholder: 'measurable outcome',
        hint: "the result in numbers, e.g. 'cutting page load from 2.1s to 0.4s'",
      },
    ],
  },
};

/** `Responsible for managing X` / `Duties included managing X` → `Managed X`. */
export const GERUND_PAST: Record<string, string> = {
  managing: 'Managed',
  leading: 'Led',
  building: 'Built',
  developing: 'Developed',
  running: 'Ran',
  maintaining: 'Maintained',
  testing: 'Tested',
  designing: 'Designed',
  coordinating: 'Coordinated',
  supporting: 'Supported',
  overseeing: 'Oversaw',
  handling: 'Handled',
  training: 'Trained',
  writing: 'Wrote',
  creating: 'Created',
  reporting: 'Reported',
  scheduling: 'Scheduled',
};

/** `Helped (to) migrate X` → `Migrated X`. */
export const STEM_PAST: Record<string, string> = {
  migrate: 'Migrated',
  build: 'Built',
  design: 'Designed',
  develop: 'Developed',
  launch: 'Launched',
  ship: 'Shipped',
  test: 'Tested',
  train: 'Trained',
  write: 'Wrote',
  create: 'Created',
  manage: 'Managed',
  run: 'Ran',
  deploy: 'Deployed',
  automate: 'Automated',
  improve: 'Improved',
  reduce: 'Reduced',
  resolve: 'Resolved',
};

/** `Was promoted to X` → `Promoted to X`. Leading position only. */
export const LEADING_PARTICIPLES: ReadonlySet<string> = new Set([
  'promoted', 'selected', 'awarded', 'recognized', 'recognised',
  'chosen', 'appointed', 'hired', 'certified', 'nominated',
]);

/** Alternatives offered for an over-used leading verb (2nd occurrence onward). */
export const VARIETY_MAP: Record<string, readonly string[]> = {
  led: ['Directed', 'Headed', 'Guided'],
  built: ['Engineered', 'Constructed', 'Assembled'],
  managed: ['Oversaw', 'Coordinated', 'Administered'],
  created: ['Produced', 'Authored', 'Established'],
  developed: ['Engineered', 'Advanced', 'Produced'],
  designed: ['Architected', 'Devised', 'Modeled'],
  improved: ['Enhanced', 'Refined', 'Elevated'],
  implemented: ['Deployed', 'Instituted', 'Delivered'],
  delivered: ['Shipped', 'Completed', 'Released'],
};

/** Filler and hedge patterns, matched in this fixed order. `after` is the replacement. */
export const FILLER_PATTERNS: ReadonlyArray<{ rule: string; pattern: RegExp; after: string }> = [
  { rule: 'wordiness_in_order_to', pattern: /\bin order to\b/gi, after: 'to' },
  { rule: 'filler_a_variety_of', pattern: /\ba variety of\s+/gi, after: '' },
  { rule: 'filler_a_number_of', pattern: /\ba number of\s+/gi, after: '' },
  { rule: 'filler_successfully', pattern: /\bsuccessfully\s+/gi, after: '' },
  { rule: 'filler_basically', pattern: /\bbasically\s+/gi, after: '' },
  { rule: 'filler_various', pattern: /\bvarious\s+/gi, after: '' },
  { rule: 'filler_several', pattern: /\bseveral\s+/gi, after: '' },
];

/** Magnitude and number words that count as an existing metric. */
export const MAGNITUDE_RE = /\b(?:thousand|million|billion|bn|dozen|hundred)\b/i;
export const NUMBER_WORD_RE =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)\b/i;
