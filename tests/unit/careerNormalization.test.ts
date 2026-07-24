import { describe, it, expect } from 'vitest';
import {
  stableHash,
  makeBlockId,
  makeSectionId,
  makeSuggestionId,
} from '../../src/lib/career/parser/identity-utils';
import { normalizeExtractedDocument } from '../../src/lib/career/parser/normalize-document';
import { ExtractedDocument } from '../../src/lib/career/parser/types';

describe('Deterministic Identity Utilities', () => {
  it('produces repeatable stableHash for identical inputs', () => {
    const text = 'Jane Doe - Senior Software Engineer';
    const hash1 = stableHash(text);
    const hash2 = stableHash(text);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('produces different stableHash for different inputs', () => {
    const hash1 = stableHash('React.js');
    const hash2 = stableHash('Vue.js');

    expect(hash1).not.toBe(hash2);
  });

  it('formats block ID according to specification', () => {
    const text = 'Summary section text';
    const expectedHash = stableHash(text);

    expect(makeBlockId(1, 0, text)).toBe(`block:1:0:${expectedHash}`);
    expect(makeBlockId(undefined, 3, text)).toBe(`block:0:3:${expectedHash}`);
  });

  it('formats section ID according to specification', () => {
    const id = makeSectionId('experience', 12, 450);
    expect(id).toBe('section:experience:12:450');
  });

  it('formats suggestion ID according to specification', () => {
    const payload = 'swap:helped:facilitated';
    const expectedHash = stableHash(payload);
    const id = makeSuggestionId('verb', 'exp_section', payload);

    expect(id).toBe(`suggestion:verb:exp_section:${expectedHash}`);
  });
});

describe('Document Normalization', () => {
  it('concatenates blocks in sourceOrder and normalizes text', () => {
    const extracted: ExtractedDocument = {
      source: { type: 'docx', fileName: 'resume.docx' },
      blocks: [
        {
          id: 'b2',
          text: 'WORK EXPERIENCE',
          sourceOrder: 1,
        },
        {
          id: 'b1',
          text: 'Jane Doe\nEngineer',
          sourceOrder: 0,
        },
        {
          id: 'b3',
          text: 'Built   scalable   APIs.\t\t',
          sourceOrder: 2,
        },
      ],
      diagnostics: [],
    };

    const result = normalizeExtractedDocument(extracted);

    expect(result.rawText).toBe('Jane Doe\nEngineer\nWORK EXPERIENCE\nBuilt   scalable   APIs.\t\t');
    expect(result.normalizedText).toBe('jane doe engineer work experience built scalable apis.');
    expect(result.offsetMap.length).toBeGreaterThan(0);
  });

  it('handles empty document gracefully', () => {
    const extracted: ExtractedDocument = {
      source: { type: 'paste' },
      blocks: [],
      diagnostics: [],
    };

    const result = normalizeExtractedDocument(extracted);

    expect(result.rawText).toBe('');
    expect(result.normalizedText).toBe('');
    expect(result.offsetMap).toEqual([]);
  });

  it('accurately maps raw offsets to canonical offsets', () => {
    const extracted: ExtractedDocument = {
      source: { type: 'txt' },
      blocks: [
        {
          id: 'b1',
          text: 'Hello    World',
          sourceOrder: 0,
        },
      ],
      diagnostics: [],
    };

    const result = normalizeExtractedDocument(extracted);

    expect(result.rawText).toBe('Hello    World');
    expect(result.normalizedText).toBe('hello world');

    // Mappings should cover "Hello", "   ", "World"
    const map = result.offsetMap;
    expect(map.length).toBe(3);

    // "Hello" -> "hello"
    expect(map[0]).toEqual({
      rawStart: 0,
      rawEnd: 5,
      canonicalStart: 0,
      canonicalEnd: 5,
    });

    // "    " -> " "
    expect(map[1]).toEqual({
      rawStart: 5,
      rawEnd: 9,
      canonicalStart: 5,
      canonicalEnd: 6,
    });

    // "World" -> "world"
    expect(map[2]).toEqual({
      rawStart: 9,
      rawEnd: 14,
      canonicalStart: 6,
      canonicalEnd: 11,
    });
  });

  it('cleans unicode smart quotes and dashes during normalization', () => {
    const extracted: ExtractedDocument = {
      source: { type: 'paste' },
      blocks: [
        {
          id: 'b1',
          text: '“Engineered”—Full-Stack',
          sourceOrder: 0,
        },
      ],
      diagnostics: [],
    };

    const result = normalizeExtractedDocument(extracted);

    expect(result.normalizedText).toBe('"engineered"-full-stack');
  });
});
