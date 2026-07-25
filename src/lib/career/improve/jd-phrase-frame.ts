/**
 * JD Phrase Frame — lift a drafted résumé sentence out of the employer's own wording.
 *
 * The tool never invents a claim. It re-voices the verb and object the JD already used and
 * hands the candidate a frame with U+241F blanks for every fact only they can supply. That
 * keeps the bullet in the employer's vocabulary (the actual retrieval benefit) while
 * leaving authorship of every specific fact with the candidate.
 */
import { STRONG_VERBS, KNOWN_VERBS } from '../amplify/data/verb-classes.js';

/**
 * JD verb form → past tense. An explicit table, never inferred morphology: "lead" → "led"
 * and "run" → "ran" defeat any suffix rule, and a wrong guess ships broken prose into a
 * résumé. Keys cover the base form and the gerund; the infinitive is handled by stripping
 * a leading "to" before lookup.
 */
const JD_VERB_PAST: Readonly<Record<string, string>> = Object.freeze({
  analyze: 'analyzed', analyzing: 'analyzed',
  author: 'authored', authoring: 'authored',
  automate: 'automated', automating: 'automated',
  build: 'built', building: 'built',
  coordinate: 'coordinated', coordinating: 'coordinated',
  create: 'created', creating: 'created',
  cut: 'cut', cutting: 'cut',
  deliver: 'delivered', delivering: 'delivered',
  design: 'designed', designing: 'designed',
  develop: 'developed', developing: 'developed',
  drive: 'drove', driving: 'drove',
  engineer: 'engineered', engineering: 'engineered',
  grow: 'grew', growing: 'grew',
  hold: 'held', holding: 'held',
  implement: 'implemented', implementing: 'implemented',
  improve: 'improved', improving: 'improved',
  increase: 'increased', increasing: 'increased',
  keep: 'kept', keeping: 'kept',
  launch: 'launched', launching: 'launched',
  lead: 'led', leading: 'led',
  make: 'made', making: 'made',
  manage: 'managed', managing: 'managed',
  migrate: 'migrated', migrating: 'migrated',
  negotiate: 'negotiated', negotiating: 'negotiated',
  oversee: 'oversaw', overseeing: 'oversaw',
  own: 'owned', owning: 'owned',
  reduce: 'reduced', reducing: 'reduced',
  resolve: 'resolved', resolving: 'resolved',
  run: 'ran', running: 'ran',
  save: 'saved', saving: 'saved',
  sell: 'sold', selling: 'sold',
  set: 'set', setting: 'set',
  ship: 'shipped', shipping: 'shipped',
  spearhead: 'spearheaded', spearheading: 'spearheaded',
  streamline: 'streamlined', streamlining: 'streamlined',
  take: 'took', taking: 'took',
  teach: 'taught', teaching: 'taught',
  train: 'trained', training: 'trained',
  win: 'won', winning: 'won',
  write: 'wrote', writing: 'wrote',
});

/**
 * A JD verb form → résumé past tense, or null when the word is not a verb we can voice.
 *
 * Double-gated on purpose: the table must know the word AND the result must already be a
 * verb the résumé engine treats as strong (`STRONG_VERBS`) or recognises (`KNOWN_VERBS`).
 * That keeps the drafted vocabulary closed and curated rather than open-ended.
 */
export function toPastTense(word: string): string | null {
  const w = String(word ?? '').toLowerCase().replace(/^to\s+/, '').trim();
  if (!w) return null;
  const past = JD_VERB_PAST[w] ?? (STRONG_VERBS.has(w) || KNOWN_VERBS.has(w) ? w : undefined);
  if (!past) return null;
  return STRONG_VERBS.has(past) || KNOWN_VERBS.has(past) ? past : null;
}
