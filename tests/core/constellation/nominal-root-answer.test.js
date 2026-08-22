import { describe, it, expect } from 'vitest';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { nominalRootAnswer } from '../../../codex/core/constellation/np-anchor.js';

/**
 * SENTENCE-ROOT endpoint — NOT the phrase endpoint DENY-0002 refused.
 *
 * 43% of UD English-EWT sentences have a non-verb gold root. The CLAUSAL doorway
 * keeps them out of `chart.stable`, so `pickResonantDerivation` abstains and the
 * parser returns nothing — even though the chart holds a full-span nominal whose
 * head it already computed. These are the heads it computed.
 *
 * Every case below is one where the chart's head and `lastTaggedNoun` DISAGREE and
 * the chart is right, so passing by picking "the last noun" is not available.
 */
/**
 * The PRODUCT lexicon's own answer for these forms, frozen verbatim from
 * `scholomance_dict.sqlite` (`lemma_form`) so the test stays hermetic without
 * inventing a lexicon. Forms absent below are absent THERE — `of`, `the`, `Tayib`,
 * `Rauf`, `Lavorato` and the punctuation carry no lexical POS, and that absence is
 * part of what these sentences are. A key mapped to `[]` would be a different fact.
 */
const POS = new Map(Object.entries({
  21: ['a', 'n'],
  birmingham: ['n'],
  dear: ['a', 'n', 'r'],
  epic: ['a', 'n'],
  fascinating: ['a'],
  future: ['a', 'n'],
  in: ['a', 'n', 'r'],
  link: ['n', 'v'],
  'mr.': ['n'],
  thanks: ['n'],
  viewpoint: ['n'],
}));

const answerFor = (tokens) => {
  const chart = composePacked(tokens, POS, {});
  return nominalRootAnswer(chart, tokens.length);
};

describe('nominalRootAnswer — the nominal head the chart already computed', () => {
  it('reads a PP-modified nominal root, not the last noun', () => {
    const tokens = ['Fascinating', 'viewpoint', 'of', 'the', 'future', 'in', 'Epic', '.'];
    expect(answerFor(tokens)).toMatchObject({ subject: null, verb: 'viewpoint' });
  });

  it('reads an appositive root, not its final element', () => {
    const tokens = ['Tayib', 'Rauf', ',', '21', ',', 'Birmingham'];
    expect(answerFor(tokens)).toMatchObject({ subject: null, verb: 'Rauf' });
  });

  it('reads a nominal head that precedes its complement', () => {
    const tokens = ['Thanks', 'for', 'the', 'link', '.'];
    expect(answerFor(tokens)).toMatchObject({ subject: null, verb: 'Thanks' });
  });

  it('reads a title-plus-name root, not the title', () => {
    const tokens = ['Dear', 'Mr.', 'Lavorato', ':'];
    expect(answerFor(tokens)).toMatchObject({ subject: null, verb: 'Lavorato' });
  });

  it('abstains rather than guessing when no full-span nominal exists', () => {
    expect(nominalRootAnswer({ spanning: [], molecules: [] }, 3)).toBeNull();
    expect(nominalRootAnswer(null, 3)).toBeNull();
    expect(nominalRootAnswer({ spanning: [] }, 0)).toBeNull();
  });

  it('refuses a nominal that does not span the whole input', () => {
    // NP[0-1] under a 4-token input is the right answer to a different question.
    const chart = { spanning: [], molecules: [{ type: 'NP', from: 0, to: 1, derivations: [] }] };
    expect(nominalRootAnswer(chart, 4)).toBeNull();
  });
});
