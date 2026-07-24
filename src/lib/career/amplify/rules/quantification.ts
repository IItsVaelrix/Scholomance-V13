import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import { leadingVerb, isQuantified, type AmplifyContext } from '../primitives.js';
import { MEASURABLE_VERB_CLASS, METRIC_TEMPLATES } from '../data/verb-classes.js';

/**
 * Capability 1 — prompt the candidate for a metric.
 * The template is ours; every number stays theirs. `requiresInput` plus the U+241F
 * sentinels mean an unfilled prompt can never reach the résumé.
 */
export function quantificationRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    if (isQuantified(line.text)) continue;

    const verb = leadingVerb(line);
    if (!verb) continue;

    const metricClass = MEASURABLE_VERB_CLASS[verb.verb.toLowerCase()];
    if (!metricClass) continue;

    const template = METRIC_TEMPLATES[metricClass];
    const targetKey = `${line.span.start}:${line.span.end}`;
    const id = makeSuggestionId('quantify', targetKey, `${metricClass}:${line.text}`);

    // Most bullets end in sentence punctuation; appending the clause after it produced
    // "…runtime., reducing …" (doubled punctuation). Move any trailing punctuation to
    // the end of the clause instead.
    const tail = /[.;:!?]+$/.exec(line.text);
    const stem = tail ? line.text.slice(0, -tail[0].length) : line.text;
    const after = stem + template.clause + (tail ? tail[0] : '');

    suggestions.push({
      id,
      type: 'quantify',
      target: { span: line.span },
      before: line.text,
      after,
      reason:
        'This accomplishment has no measurable result. Fill in each blank with your own ' +
        'numbers — nothing is written to your résumé until every blank is filled.',
      evidence: [
        {
          source: 'resume',
          rule: 'quantification',
          text: line.text,
          span: line.span,
          confidence: 0.75,
        },
      ],
      confidence: 0.75,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
      requiresInput: true,
      inputSlots: template.slots.map((slot, index) => ({
        id: `${id}:slot:${index}`,
        placeholder: slot.placeholder,
        hint: slot.hint,
      })),
    });
  }

  return suggestions;
}
