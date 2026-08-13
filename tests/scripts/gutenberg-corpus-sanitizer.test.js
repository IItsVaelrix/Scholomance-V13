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

  it('treats a bound title as never sentence-final', () => {
    // `I saw the Dr. and left.` IS one sentence. An earlier fixture here pinned
    // it as two, to bound the connector rule — that assertion was wrong English,
    // and the bound-title rule corrects it: `Mr`, `Dr`, `MS` and their kin exist
    // to precede something, so their period is never a boundary.
    expect(segmentGutenbergParagraph('I saw the Dr. and left.'))
      .toEqual(['I saw the Dr. and left.']);
    expect(segmentGutenbergParagraph('He said Mr. what’s his name. She laughed.'))
      .toEqual(['He said Mr. what’s his name.', 'She laughed.']);
  });

  it('still requires context for a title that CAN end a sentence', () => {
    // `St.` is the pair that forces the distinction: Saint binds to a name,
    // `Main St.` binds to nothing.
    expect(segmentGutenbergParagraph('She met Dr. Watson at St. Paul. It rained.'))
      .toEqual(['She met Dr. Watson at St. Paul.', 'It rained.']);
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

  it('classifies a contents block and a heading line, and leaves prose alone', () => {
    // A TOC paragraph is long, so the length test could not reach it, and
    // segmentation minted `CHAPTER XII.` as a sentence 26 times in the rebuilt
    // corpus. The keyword count is CASE-SENSITIVE on purpose: `The chapter of
    // accidents is the longest chapter in the book` reaches three in lower case
    // and is prose — quarantining it would be the same silent population edit
    // in a new coat.
    expect(classifyStructuralParagraph('CHAPTER I. Down the Rabbit-Hole CHAPTER II. The Pool of Tears CHAPTER III. A Caucus-Race'))
      .toBe('heading');
    expect(classifyStructuralParagraph('SCENE: In the end of the Fourth Act, in England; through the rest of the Play, in Scotland'))
      .toBe('heading');
    expect(classifyStructuralParagraph('ACT I Scene I. An open Place.')).toBe('heading');
    expect(classifyStructuralParagraph('The chapter of accidents is the longest chapter in the book, as they say.'))
      .toBeNull();
    expect(classifyStructuralParagraph('In Act I, Scene II, the actor described a long and winding road.'))
      .toBeNull();
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
