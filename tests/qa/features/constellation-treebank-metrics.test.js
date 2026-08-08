import { describe, it, expect } from 'vitest';
import { summarize } from '../../../codex/core/constellation/treebank-metrics.js';
import { OUTCOME } from '../../../codex/core/constellation/failure-diagnosis.js';

const row = (over) => ({
  outcome: OUTCOME.PARSED, overGenerated: false, categories: [], nonProjective: 0,
  rootUpos: 'VERB', contained: true, decided: true, ...over,
});

describe('summarize', () => {
  it('separates coverage from containment from decision', () => {
    const report = summarize([
      row({}),
      row({ contained: false, decided: false }),
      row({ outcome: OUTCOME.GRAMMAR, contained: false, decided: false }),
    ]);
    expect(report.n).toBe(3);
    expect(report.coverage).toBeCloseTo(2 / 3);
    expect(report.containment).toBeCloseTo(1 / 3);
    expect(report.decision).toBeCloseTo(1 / 3);
  });

  /**
   * With no sense counts every attraction score is 1, ties keep insertion
   * order, and `decision` would silently become "the first parse the chart
   * enumerated" while still printing as an accuracy.
   */
  it('reports decision as null when any row could not be decided', () => {
    const report = summarize([row({ decided: null }), row({})]);
    expect(report.decision).toBeNull();
    expect(report.coverage).toBe(1);
  });

  it('fills the POS ablation 2x2', () => {
    const report = summarize([
      row({}),
      row({ overGenerated: true }),
      row({ outcome: OUTCOME.LEXICAL }),
      row({ outcome: OUTCOME.GRAMMAR }),
      row({ outcome: OUTCOME.ROOT_TYPE_MISMATCH }),
    ]);
    expect(report.ablation).toEqual({
      bothFine: 1, overGenerated: 1, tagging: 1, grammar: 2,
    });
  });

  it('ranks categories by failure count and counts sole causes separately', () => {
    const xcomp = { deprel: 'xcomp', label: 'xcomp (VERB -> VERB)', from: 0, to: 2 };
    const advcl = { deprel: 'advcl', label: 'advcl (VERB -> VERB)', from: 3, to: 5 };
    const report = summarize([
      row({ outcome: OUTCOME.GRAMMAR, categories: [xcomp] }),
      row({ outcome: OUTCOME.GRAMMAR, categories: [xcomp] }),
      row({ outcome: OUTCOME.GRAMMAR, categories: [xcomp, advcl] }),
    ]);
    expect(report.categories[0]).toMatchObject({
      label: 'xcomp (VERB -> VERB)', failures: 3, soleCause: 2,
    });
    expect(report.categories[1]).toMatchObject({
      label: 'advcl (VERB -> VERB)', failures: 1, soleCause: 0,
    });
  });

  /**
   * An instrument that explains every failure and assigns four causes to each
   * is a horoscope. The report has to expose that rather than hide it.
   */
  it('reports how much of the failure set it actually classified', () => {
    const cat = { deprel: 'conj', label: 'conj (VERB -> VERB)', from: 0, to: 1 };
    const report = summarize([
      row({ outcome: OUTCOME.GRAMMAR, categories: [cat, cat] }),
      row({ outcome: OUTCOME.ROOT_TYPE_MISMATCH, categories: [] }),
      row({}),
    ]);
    expect(report.classifier).toEqual({ failures: 2, withCategory: 1, meanCauses: 1 });
  });

  it('breaks out by root UPOS instead of averaging over fragments', () => {
    const report = summarize([
      row({ rootUpos: 'VERB' }),
      row({ rootUpos: 'NOUN', outcome: OUTCOME.GRAMMAR, contained: false }),
      row({ rootUpos: 'NOUN', outcome: OUTCOME.GRAMMAR, contained: false }),
    ]);
    const noun = report.byRootUpos.find((b) => b.upos === 'NOUN');
    expect(noun).toMatchObject({ n: 2, coverage: 0, containment: 0 });
  });

  it('returns zeroes rather than NaN for an empty run', () => {
    const report = summarize([]);
    expect(report).toMatchObject({ n: 0, coverage: 0, containment: 0, decision: 0 });
    expect(report.categories).toEqual([]);
  });
});
