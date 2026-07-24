import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import { leadingVerb, type AmplifyContext, type VerbMatch } from '../primitives.js';
import { WEAK_VERBS, VARIETY_MAP } from '../data/verb-classes.js';

const REPETITION_THRESHOLD = 3;

/**
 * Capability 4 — an over-used leading verb flattens a résumé.
 * The first occurrence is never touched; occurrences 2..n each get a distinct alternative.
 */
export function repetitionRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const byVerb = new Map<string, VerbMatch[]>();

  for (const line of ctx.lines) {
    const verb = leadingVerb(line);
    if (!verb) continue;
    const lower = verb.verb.toLowerCase();
    if (WEAK_VERBS.has(lower)) continue;

    const bucket = byVerb.get(lower);
    if (bucket) bucket.push(verb);
    else byVerb.set(lower, [verb]);
  }

  const suggestions: ResumeSuggestion[] = [];

  // Map iteration order is first-appearance order — deterministic.
  for (const [lower, occurrences] of byVerb) {
    if (occurrences.length < REPETITION_THRESHOLD) continue;

    const alternatives = VARIETY_MAP[lower];
    if (!alternatives || alternatives.length === 0) continue;

    for (let i = 1; i < occurrences.length; i++) {
      const occurrence = occurrences[i];
      const after = alternatives[(i - 1) % alternatives.length];
      const targetKey = `${occurrence.span.start}:${occurrence.span.end}`;
      const id = makeSuggestionId('verb', targetKey, `repetition:${lower}->${after}`);

      suggestions.push({
        id,
        type: 'verb',
        target: { span: occurrence.span },
        before: occurrence.verb,
        after,
        reason: `"${occurrence.verb}" leads ${occurrences.length} bullets. Vary this one to "${after}" so each accomplishment reads distinctly.`,
        evidence: [
          {
            source: 'resume',
            rule: 'repetition',
            text: occurrence.verb,
            span: occurrence.span,
            confidence: 0.7,
          },
        ],
        confidence: 0.7,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      });
    }
  }

  return suggestions;
}
