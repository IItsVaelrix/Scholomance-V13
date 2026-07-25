import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import { leadingVerb, isQuantified, classifyObject, type AmplifyContext } from '../primitives.js';
import { MEASURABLE_VERB_CLASS, METRIC_TEMPLATES, type MetricTemplate, type MetricClass } from '../data/verb-classes.js';

/**
 * Resolve the metric template, guarding against frame fabrication (honesty correction).
 * The `team` template asserts "managing a team of N" — truthful only when the source line
 * actually references a people object (team/staff/engineers/…). "Managed communications"
 * or "Led the billing platform rewrite" do NOT state a team, so we downgrade to the generic
 * `open` outcome slot rather than put a headcount frame in the candidate's mouth. The
 * number itself still only enters via the candidate-filled sentinel.
 */
function resolveTemplate(verb: string, ctx: { text: string; span: any }, verbEndOffset: number): { metricClass: MetricClass; template: MetricTemplate } | null {
  const metricClass = MEASURABLE_VERB_CLASS[verb.toLowerCase()];
  if (!metricClass) return null;
  if (metricClass === 'team') {
    const obj = classifyObject({ text: ctx.text, span: ctx.span, sectionKind: 'experience' }, verbEndOffset);
    if (obj?.objectClass !== 'people') {
      return { metricClass: 'open', template: METRIC_TEMPLATES.open };
    }
  }
  return { metricClass, template: METRIC_TEMPLATES[metricClass] };
}

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

    const resolved = resolveTemplate(verb.verb, line, verb.offsetInLine + verb.verb.length);
    if (!resolved) continue;
    const { metricClass, template } = resolved;

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
