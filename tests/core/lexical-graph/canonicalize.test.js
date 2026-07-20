import { describe, it, expect } from 'vitest';
import { canonicalizeLower, wordLexicalId, deviceLexicalId } from '../../../codex/core/lexical-graph/canonicalize.js';

describe('canonicalizeLower', () => {
  it('NFC + en-US lower + collapse spaces', () => {
    expect(canonicalizeLower('  Grief\u00A0 Ceiling  ')).toBe('grief ceiling');
    expect(canonicalizeLower('\u212B')).toBe(canonicalizeLower('\u00C5')); // Å via NFC
  });
});

describe('ids', () => {
  it('word id uses entry_id not headword', () => {
    expect(wordLexicalId(42)).toBe('le:word:42');
    expect(deviceLexicalId('Antithesis')).toBe('le:device:antithesis');
  });
});
