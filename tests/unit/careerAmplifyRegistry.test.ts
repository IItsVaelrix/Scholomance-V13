import { describe, it, expect } from 'vitest';
import { buildAmplifications } from '../../src/lib/career/amplify/registry';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/verb-classes';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

const RESUME = [
  'Responsible for managing the release process.',
  'Helped the support team resolve escalations.',
  'Successfully launched the mobile app.',
  'Led the billing migration.',
  'Led the support rotation.',
  'Led the hiring loop.',
].join('\n');

describe('amplification registry', () => {
  it('runs every rule and tags each suggestion with its rule', () => {
    const suggestions = buildAmplifications(makeResumeDoc(RESUME));
    const rules = new Set(suggestions.map((s) => s.evidence[0]?.rule));

    expect(rules.has('quantification')).toBe(true);
    expect(rules.has('verb_strength_class')).toBe(true);
    expect(rules.has('construction_responsible_for')).toBe(true);
    expect(rules.has('filler_successfully')).toBe(true);
    expect(rules.has('repetition')).toBe(true);
  });

  it('anchors every suggestion to raw text that still matches', () => {
    const doc = makeResumeDoc(RESUME);
    for (const sug of buildAmplifications(doc)) {
      expect(sug.target?.span?.coordinateSpace).toBe('raw');
      const { start, end } = sug.target!.span!;
      expect(doc.rawText.slice(start, end)).toBe(sug.before);
      expect(sug.requiresUserApproval).toBe(true);
      expect(sug.status).toBe('pending');
    }
  });

  it('produces byte-identical output across runs', () => {
    const first = buildAmplifications(makeResumeDoc(RESUME));
    const second = buildAmplifications(makeResumeDoc(RESUME));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('adds no claim the candidate did not make', () => {
    const doc = makeResumeDoc(RESUME);
    const accepted = buildAmplifications(doc)
      .filter((s) => s.requiresInput !== true)
      .map((s) => ({ ...s, status: 'accepted' as const }));

    const result = applyAcceptedSuggestions(doc, accepted);
    expect(result.text).not.toContain(INPUT_SENTINEL);
    expect(result.text).not.toMatch(/\d/);
  });

  it('keeps an unfilled quantification prompt out of the résumé', () => {
    const doc = makeResumeDoc(RESUME);
    const quantify = buildAmplifications(doc)
      .filter((s) => s.requiresInput === true)
      .map((s) => ({ ...s, status: 'accepted' as const }));

    expect(quantify.length).toBeGreaterThan(0);
    const result = applyAcceptedSuggestions(doc, quantify);
    expect(result.applied).toEqual([]);
    expect(result.skipped.every((s) => s.reason === 'unfilled_input')).toBe(true);
  });

  it('documents the known overlap boundary: a whole-line quantify conflicts with an inline tighten', () => {
    // Leading measurable verb (→ whole-line quantify) plus an inline filler (→ tighten).
    const doc = makeResumeDoc('Launched the mobile app successfully across the org.');
    const accepted = buildAmplifications(doc).map((s) => ({
      ...s,
      status: 'accepted' as const,
      after: (s.after || '').split(INPUT_SENTINEL).join('12'),
    }));

    expect(accepted.length).toBe(2); // one quantify (whole line) + one filler (inline)
    const result = applyAcceptedSuggestions(doc, accepted);
    expect(result.applied).toEqual([]);
    expect(result.skipped.every((s) => s.reason === 'overlap')).toBe(true);
  });

  it('returns nothing for a document with no amplifiable sections', () => {
    expect(buildAmplifications(makeResumeDoc('Python, TypeScript, SQL', 'skills'))).toEqual([]);
  });
});
