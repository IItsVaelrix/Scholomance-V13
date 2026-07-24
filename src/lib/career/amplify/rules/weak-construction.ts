import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import {
  classifyObject,
  capitalizeFirst,
  type AccomplishmentLine,
  type AmplifyContext,
} from '../primitives.js';
import {
  GERUND_PAST,
  STEM_PAST,
  LEADING_PARTICIPLES,
  CLASS_STRONG_VERB,
} from '../data/verb-classes.js';

interface ConstructionMatch {
  rule: string;
  /** Offset of the matched text inside line.text. */
  offset: number;
  before: string;
  after: string;
  reason: string;
}

const BULLET = '(?:[\\u2022\\u00B7\\u25AA\\u25E6\\u2013\\u2014*-]\\s+|\\d+[.)]\\s+)?';

const RESPONSIBLE_FOR = new RegExp(`^${BULLET}(responsible for (\\w+ing))\\b`, 'i');
const DUTIES_INCLUDED = new RegExp(`^${BULLET}(duties included (\\w+ing))\\b`, 'i');
const LEADING_PASSIVE = new RegExp(`^${BULLET}((?:was|were) (\\w+))\\b`, 'i');
const HELPED_TO = new RegExp(`^${BULLET}(helped (?:to )?(\\w+))\\b`, 'i');
const WORKED_ON = new RegExp(`^${BULLET}(worked on)\\b`, 'i');

/**
 * Match a gerund prefix pattern and return the corresponding past-tense verb.
 * Used by responsible-for and duties-included patterns.
 */
function matchGerundPrefix(
  regex: RegExp,
  rule: string,
  text: string
): ConstructionMatch | null {
  const m = regex.exec(text);
  if (!m) return null;
  const past = GERUND_PAST[m[2].toLowerCase()];
  if (!past) return null;
  return {
    rule,
    offset: text.indexOf(m[1]),
    before: m[1],
    after: past,
    reason: `"${m[1]}" describes a job description. "${past}" describes what you did.`,
  };
}

/**
 * Capability 3a — leading passive and prefix constructions.
 * Anchored to the start of the line: a mid-sentence rewrite is exactly the class of
 * damage this engine exists to avoid. First matching recipe wins.
 */
function matchConstruction(line: AccomplishmentLine): ConstructionMatch | null {
  const text = line.text;

  const responsible = matchGerundPrefix(RESPONSIBLE_FOR, 'construction_responsible_for', text);
  if (responsible) return responsible;

  const duties = matchGerundPrefix(DUTIES_INCLUDED, 'construction_duties_included', text);
  if (duties) return duties;

  const passive = LEADING_PASSIVE.exec(text);
  if (passive) {
    const participle = passive[2].toLowerCase();
    if (!LEADING_PARTICIPLES.has(participle)) return null;
    const after = capitalizeFirst(participle);
    return {
      rule: 'construction_leading_passive',
      offset: text.indexOf(passive[1]),
      before: passive[1],
      after,
      reason: `Drop the passive auxiliary: "${after}" is more direct than "${passive[1]}".`,
    };
  }

  const helped = HELPED_TO.exec(text);
  if (helped) {
    const past = STEM_PAST[helped[2].toLowerCase()];
    if (!past) return null;
    return {
      rule: 'construction_helped_to',
      offset: text.indexOf(helped[1]),
      before: helped[1],
      after: past,
      reason: `"${helped[1]}" hides your contribution behind someone else's work. "${past}" claims the same work directly.`,
    };
  }

  const worked = WORKED_ON.exec(text);
  if (worked) {
    const offset = text.indexOf(worked[1]);
    const classified = classifyObject(line, offset + worked[1].length);
    if (!classified) return null;
    const after = CLASS_STRONG_VERB[classified.objectClass];
    return {
      rule: 'construction_worked_on',
      offset,
      before: worked[1],
      after,
      reason: `"${worked[1]}" says you were present. "${after}" says what you produced.`,
    };
  }

  return null;
}

export function weakConstructionRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const match = matchConstruction(line);
    if (!match) continue;

    const span = {
      coordinateSpace: 'raw' as const,
      start: line.span.start + match.offset,
      end: line.span.start + match.offset + match.before.length,
    };
    const targetKey = `${span.start}:${span.end}`;
    const id = makeSuggestionId('tighten', targetKey, `${match.rule}:${match.before}->${match.after}`);

    suggestions.push({
      id,
      type: 'tighten',
      target: { span },
      before: match.before,
      after: match.after,
      reason: match.reason,
      evidence: [
        {
          source: 'resume',
          rule: match.rule,
          text: match.before,
          span,
          confidence: 0.85,
        },
      ],
      confidence: 0.85,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
    });
  }

  return suggestions;
}
