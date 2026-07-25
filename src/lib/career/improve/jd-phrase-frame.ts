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

import { clauseAt } from './jd-clause.js';
import { INPUT_SENTINEL } from '../amplify/data/input-sentinel.js';
import type { Requirement } from './types.js';
import type { TextSpan } from '../parser/types.js';

export interface PhraseFrame {
  /** Draft text with U+241F sentinels where the candidate must supply a fact. */
  text: string;
  /** One slot per sentinel, in left-to-right order. */
  slots: { placeholder: string; hint: string }[];
  /** The JD clause the wording came from — the provenance source of record. */
  sourceClause: string;
  /** Span of that clause in the JD text. */
  sourceSpan: TextSpan;
}

/**
 * Leading words that describe the SHAPE of a requirement rather than its content, plus the
 * second-person scaffolding JDs open with. Stripped only from the FRONT of a clause: a
 * "with" in the middle ("integrated with Stripe") is real content.
 */
const LEADING_NOISE: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'the', 'or', 'of', 'in', 'with', 'to', 'for',
  'ability', 'background', 'comfort', 'comfortable', 'deep', 'demonstrated',
  'excellent', 'experience', 'experienced', 'expertise', 'exposure', 'familiar',
  'familiarity', 'good', 'great', 'hands', 'knowledge', 'minimum', 'practical',
  'preferred', 'prior', 'proficiency', 'proficient', 'proven', 'required', 'skill',
  'skills', 'solid', 'strong', 'successful', 'track', 'record', 'understanding',
  'willingness', 'year', 'years',
  // second-person / modal scaffolding
  'you', 'we', 'they', 'will', 'should', 'must', 'can', 'able',
  // copulas: `toPastTense` resolves these verbatim (via KNOWN_VERBS, which lists them as
  // past-tense forms), but a bare copula makes a useless sentence opener on its own — "Was
  // responsible for X" reads as broken prose, not a résumé bullet. Treating them as leading
  // noise means a clause like "was responsible for X" falls through past them to the next
  // real content word instead of drafting around the copula.
  'was', 'were', 'is', 'are', 'be', 'been', 'being',
  // "responsible for" is the copula's usual companion and is scaffolding of the same kind:
  // it names the SHAPE of an accomplishment ("you owned this"), not its content. Standard
  // résumé advice is to delete it and lead with the verb it was hiding — "responsible for
  // managing vendor relationships" and "managed vendor relationships" name the same fact.
  'responsible', 'responsibility', 'responsibilities',
]);

/** Leading list glyphs and duration counts ("5+", "3-5") carry no content. */
function isLeadingNoise(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z0-9+-]/g, '');
  if (!t) return true;
  if (/^\d+[+-]?\d*$/.test(t)) return true;
  return LEADING_NOISE.has(t);
}

const OUTCOME_SLOT = Object.freeze({
  placeholder: 'the result',
  hint: 'the result it produced — a number, a time saved, an outcome',
});

/**
 * Build a drafted sentence frame from the JD's own wording, or null when the clause cannot
 * be voiced confidently.
 *
 * Fail closed: a requirement whose phrasing we cannot rewrite gets no draft, and its card
 * keeps its existing prose form. An awkward draft in a résumé is worse than an honest
 * instruction.
 */
export function buildPhraseFrame(jdText: string, requirement: Requirement): PhraseFrame | null {
  const span = requirement.jdEvidence?.[0];
  if (!span) return null;

  const text = String(jdText ?? '');
  const sourceClause = clauseAt(text, span.start, span.end);
  if (!sourceClause.trim()) return null;

  // Locate the clause's own span so the evidence trail points at real JD bytes.
  const clauseStart = text.indexOf(sourceClause, Math.max(0, span.start - sourceClause.length));
  if (clauseStart === -1) return null;
  const sourceSpan: TextSpan = {
    coordinateSpace: 'raw',
    start: clauseStart,
    end: clauseStart + sourceClause.length,
  };

  // Tokenize on whitespace, dropping list glyphs and trailing sentence punctuation.
  const tokens = sourceClause
    .replace(/^[\s•\-*–—]+/, '')
    .replace(/[.;:!?]+\s*$/, '')
    .split(/\s+/)
    .filter(Boolean);

  // Strip leading scaffolding.
  let i = 0;
  while (i < tokens.length && isLeadingNoise(tokens[i])) i++;
  const rest = tokens.slice(i);
  if (rest.length === 0) return null;

  // First token that resolves as a verb becomes the sentence's verb. Copulas are already
  // excluded above (folded into LEADING_NOISE), so this never lands on a bare "was"/"were".
  const past = toPastTense(rest[0]);
  const body = past ? rest.slice(1).join(' ') : rest.join(' ');
  if (!body.trim()) return null;

  const verb = past ?? 'used';
  const opening = verb.charAt(0).toUpperCase() + verb.slice(1);

  return {
    text: `${opening} ${body}, ${INPUT_SENTINEL}`,
    slots: [{ ...OUTCOME_SLOT }],
    sourceClause,
    sourceSpan,
  };
}
