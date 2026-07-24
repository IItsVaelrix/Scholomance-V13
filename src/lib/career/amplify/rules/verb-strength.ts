import { makeSuggestionId } from '../../parser/identity-utils.js';
import { TORQUE_MAP } from '../../transmuter.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import {
  leadingVerb,
  classifyObject,
  nextTokenAfter,
  capitalizeFirst,
  type AmplifyContext,
} from '../primitives.js';
import { WEAK_VERBS, PREPOSITIONS, CLASS_STRONG_VERB } from '../data/verb-classes.js';

const TORQUE: Record<string, string> = TORQUE_MAP as Record<string, string>;

/**
 * Capability 2 — replace a weak LEADING verb with one chosen by the object it governs.
 * Leading only: the old global TORQUE_MAP sweep rewrote every occurrence in the document.
 */
export function verbStrengthRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const verb = leadingVerb(line);
    if (!verb) continue;

    const lower = verb.verb.toLowerCase();
    if (!WEAK_VERBS.has(lower)) continue;

    const afterVerb = verb.offsetInLine + verb.verb.length;

    // "worked on X" / "participated in X": the verb governs no direct object here.
    const next = nextTokenAfter(line, afterVerb);
    if (next && PREPOSITIONS.has(next)) continue;

    const classified = classifyObject(line, afterVerb);
    let replacement: string | null = null;
    let rule = 'verb_strength_class';

    if (classified) {
      replacement = CLASS_STRONG_VERB[classified.objectClass];
    } else if (TORQUE[lower]) {
      replacement = TORQUE[lower];
      rule = 'verb_strength_torque_fallback';
    }

    if (!replacement) continue;
    if (replacement.toLowerCase() === lower) continue;

    // The leading verb of a bullet is always capitalized.
    const after = capitalizeFirst(replacement);
    const targetKey = `${verb.span.start}:${verb.span.end}`;
    const id = makeSuggestionId('verb', targetKey, `${lower}->${after}:${rule}`);

    suggestions.push({
      id,
      type: 'verb',
      target: { span: verb.span },
      before: verb.verb,
      after,
      reason: classified
        ? `"${verb.verb}" understates what you did to the ${classified.keyword}. "${after}" is the stronger verb for that kind of work.`
        : `Replace the low-torque verb "${verb.verb}" with the higher-impact "${after}".`,
      evidence: [
        {
          source: 'resume',
          rule,
          text: verb.verb,
          span: verb.span,
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
