import { describe, expect, it } from 'vitest';
import {
  GUTENBERG_SANITIZATION_CONTRACT,
  SANITIZATION_REASON,
  classifyStructuralParagraph,
  countQuarantine,
  createQuarantineLedger,
  endsWithProtectedAbbreviation,
  sanitizeGutenbergText,
  segmentGutenbergParagraph,
  stripGutenbergWrapper,
} from '../../scripts/lib/gutenberg-corpus-sanitizer.mjs';

const words = (text) => text.toLowerCase().match(/[a-z]+(?:-[a-z]+)*/g) || [];

describe('Project Gutenberg corpus sanitation', () => {
  it('keeps honorifics and name initials inside their sentence', () => {
    expect(segmentGutenbergParagraph('Mr. Bennet planted the peach-tree. It grew.'))
      .toEqual(['Mr. Bennet planted the peach-tree.', 'It grew.']);
    expect(segmentGutenbergParagraph('Dr. Watson waited at St. Paul. It rained.'))
      .toEqual(['Dr. Watson waited at St. Paul.', 'It rained.']);
    expect(segmentGutenbergParagraph('J. R. Hartley wrote it. Vol. II. It sold.'))
      .toEqual(['J. R. Hartley wrote it.', 'Vol. II.', 'It sold.']);
  });

  it('keeps a title joined to its name by a lowercase connector', () => {
    // Two shapes, both found by rebuilding the 115k-row corpus and reading what
    // survived: `Mr. and Mrs. Bennet` (21 truncations) and `Mr. de Ville` (1).
    // The title rule wanted a capital and found a lowercase connector.
    expect(segmentGutenbergParagraph('He had a letter from Mr. de Ville of London. She read it.'))
      .toEqual(['He had a letter from Mr. de Ville of London.', 'She read it.']);
    expect(segmentGutenbergParagraph('Mr. and Mrs. Bennet went out. She stayed.'))
      .toEqual(['Mr. and Mrs. Bennet went out.', 'She stayed.']);
    expect(segmentGutenbergParagraph('Mr. & Mrs. Gardiner arrived.'))
      .toEqual(['Mr. & Mrs. Gardiner arrived.']);
  });

  it('does not let a coordinator protect a title with no second name after it', () => {
    // The coordinator alone must not be enough, or `the Dr. and left` would
    // swallow the boundary wherever a title happens to precede one.
    expect(segmentGutenbergParagraph('I saw the Dr. and left.'))
      .toEqual(['I saw the Dr.', 'and left.']);
  });

  it('recognises sentence boundaries after closing quotation marks', () => {
    expect(segmentGutenbergParagraph('“Run!” cried Dr. Watson. He ran.'))
      .toEqual(['“Run!”', 'cried Dr. Watson.', 'He ran.']);
  });

  it('protects contextual abbreviations without making every dotted form immortal', () => {
    expect(endsWithProtectedAbbreviation('Mr.', 'Bennet arrived.')).toBe(true);
    expect(endsWithProtectedAbbreviation('J.', 'R. Hartley')).toBe(true);
    expect(endsWithProtectedAbbreviation('Vol.', 'II.')).toBe(true);
    expect(endsWithProtectedAbbreviation('etc.', 'and more followed.')).toBe(true);
    expect(endsWithProtectedAbbreviation('etc.', 'Another sentence began.')).toBe(false);
    expect(endsWithProtectedAbbreviation('Vol.', 'Another sentence began.')).toBe(false);
  });

  it('classifies structural matter narrowly and leaves prose unclassified', () => {
    expect(classifyStructuralParagraph('[Illustration: THE CASTLE]'))
      .toBe(SANITIZATION_REASON.ILLUSTRATION);
    expect(classifyStructuralParagraph('* * * * *'))
      .toBe(SANITIZATION_REASON.ASTERISM);
    expect(classifyStructuralParagraph('CHAPTER XII.'))
      .toBe(SANITIZATION_REASON.HEADING);
    expect(classifyStructuralParagraph('____')).toBe(SANITIZATION_REASON.MARKUP);
    expect(classifyStructuralParagraph('The chapter ended in silence.')).toBe(null);
  });

  it('strips the wrapper without admitting licence prose or deleting the body', () => {
    const raw = [
      'metadata',
      '*** START OF THIS PROJECT GUTENBERG EBOOK SAMPLE ***',
      'Mr. Bennet planted the peach-tree. It grew.',
      '*** END OF THIS PROJECT GUTENBERG EBOOK SAMPLE ***',
      'licence',
    ].join('\n');
    expect(stripGutenbergWrapper(raw)).toBe('Mr. Bennet planted the peach-tree. It grew.');
  });

  it('accounts for every excluded sentence candidate with a declared reason', () => {
    const text = [
      '*** START OF THIS PROJECT GUTENBERG EBOOK SAMPLE ***',
      'CHAPTER I.',
      '',
      'Mr. Bennet planted the peach-tree. It grew. Tiny.',
      '',
      '[Illustration: A TREE]',
      '*** END OF THIS PROJECT GUTENBERG EBOOK SAMPLE ***',
    ].join('\n');
    const packet = sanitizeGutenbergText(text, {
      minTokens: 2,
      maxTokens: 5,
      tokenize: words,
      accept: ({ tokens }) => tokens.some((token) => token.includes('-'))
        ? { accepted: true, value: 'compound-bearing' }
        : { accepted: false, reason: SANITIZATION_REASON.NO_COMPOUND },
    });

    expect(packet.contract).toBe(GUTENBERG_SANITIZATION_CONTRACT);
    expect(packet.segments.map((segment) => segment.text))
      .toEqual(['Mr. Bennet planted the peach-tree.']);
    expect(packet.quarantine).toEqual({ heading: 1, noCompound: 1, tooShort: 1, illustration: 1 });
    expect(packet.counts).toEqual({
      paragraphs: 3,
      sentenceCandidates: 3,
      accepted: 1,
      sentenceQuarantined: 2,
      structuralQuarantined: 2,
    });
    expect(packet.counts.accepted + packet.counts.sentenceQuarantined)
      .toBe(packet.counts.sentenceCandidates);
  });

  it('refuses unknown quarantine reasons instead of creating an ungoverned bucket', () => {
    const ledger = createQuarantineLedger();
    expect(() => countQuarantine(ledger, 'miscellaneous')).toThrow(/unknown sanitation reason/);
    expect(ledger).toEqual({});
  });
});
