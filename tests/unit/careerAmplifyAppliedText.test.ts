import { describe, it, expect } from 'vitest';
import { buildAmplifications } from '../../src/lib/career/amplify/registry';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/verb-classes';
import { makeResumeDoc } from './fixtures/career-amplify-doc';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

/**
 * The missing falsifier: every other amplify test asserts suggestion *objects*.
 * This one builds suggestions, accepts them, applies them, and reads the résumé a
 * candidate would actually see. Three real defects shipped past an all-green suite
 * because nothing here existed. Each bullet below trips its corresponding defect
 * if reintroduced:
 *
 *  - "Successfully launched the mobile app." — a leading filler removal with an
 *    empty replacement lowercased the bullet ("Successfully launched..." ->
 *    "launched..."). Reverting that fix flips the leading 'L' of "Launched" back
 *    to lowercase, which the "every line starts uppercase" assertion below catches.
 *  - "Reduced the deployment pipeline runtime." — the quantification clause doubled
 *    sentence punctuation ("...runtime., reducing"). Reverting that fix reintroduces
 *    the doubled period+comma, which the "no doubled sentence punctuation" regex
 *    below catches.
 *  - "Helped the support team." — a bare weak-leading-verb bullet with no trailing
 *    clause. Proves verb-strength still fires when nothing follows the object:
 *    "Helped" -> "Led".
 *  - "Helped the support team resolve escalations." — the verb-strength catenative
 *    guard: rewriting only the leading verb here produces the ungrammatical "Led
 *    the support team resolve escalations." Reverting the guard changes this line;
 *    the exact-output assertion below requires it to survive verbatim.
 */

const RAW = [
  'Successfully launched the mobile app.', // leading filler
  'Reduced the deployment pipeline runtime.', // measurable leading verb, trailing period
  'Helped the support team.', // weak leading verb, no trailing clause
  'Helped the support team resolve escalations.', // catenative guard: must NOT rewrite
].join('\n');

/** Mirrors SuggestionReviewPanel.fillSlots: a human filling in each blank in order. */
function fillWithSampleValues(after: string, values: readonly string[]): string {
  let i = 0;
  const segments = after.split(INPUT_SENTINEL);
  return segments
    .map((segment, index) => (index === segments.length - 1 ? segment : segment + values[i++]))
    .join('');
}

describe('amplified résumé text (applied, not suggestion objects)', () => {
  it('produces the sentence a candidate would actually read', () => {
    const doc = makeResumeDoc(RAW);
    const suggestions = buildAmplifications(doc);

    // Sample values a candidate would type into the quantify prompt's blanks —
    // supplied by us here exactly as SuggestionReviewPanel.fillSlots would, so the
    // "amplify only, never add claims" law still holds: the digits are ours, not the
    // machine's.
    const SAMPLE_SLOT_VALUES = ['build time', '40'];

    const accepted: ResumeSuggestion[] = suggestions.map((s) => {
      if (s.requiresInput === true) {
        return {
          ...s,
          after: fillWithSampleValues(s.after ?? '', SAMPLE_SLOT_VALUES),
          status: 'accepted' as const,
        };
      }
      return { ...s, status: 'accepted' as const };
    });

    const result = applyAcceptedSuggestions(doc, accepted);

    expect(result.skipped).toEqual([]);
    expect(result.applied.length).toBe(accepted.length);

    // Fix 1: a leading filler removal must not lowercase the bullet.
    for (const line of result.text.split('\n')) {
      if (line.length === 0) continue;
      expect(line[0]).toBe(line[0].toUpperCase());
    }

    // No unfilled prompt ever reaches the résumé.
    expect(result.text).not.toContain(INPUT_SENTINEL);

    // Fix 4: no doubled sentence punctuation from the quantification clause.
    expect(result.text).not.toMatch(/[.;:!?],/);

    // Amplify only, never add claims: the only new digits are the ones we (as the
    // simulated candidate) supplied for the quantify prompt above.
    const withoutSuppliedDigits = result.text.replace(/40/g, '');
    expect(withoutSuppliedDigits).not.toMatch(/\d/);

    // The exact applied sentence, not a suggestion object.
    expect(result.text).toBe(
      [
        'Launched the mobile app.',
        'Reduced the deployment pipeline runtime, reducing build time by 40%.',
        'Led the support team.',
        // Catenative guard: rewriting only "Helped" here would produce the
        // ungrammatical "Led the support team resolve escalations." This line must
        // survive completely unchanged.
        'Helped the support team resolve escalations.',
      ].join('\n')
    );
  });
});
