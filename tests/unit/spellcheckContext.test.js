import { describe, it, expect } from 'vitest';
import { extractPreviousWord } from '../../codex/core/spellcheckContext.js';

describe('extractPreviousWord', () => {
  it('returns the completed word before the current prefix', () => {
    expect(extractPreviousWord('to stel', 'stel')).toBe('to');
    expect(extractPreviousWord('the steel', 'steel')).toBe('the');
    expect(extractPreviousWord('ancient grimoyre', 'grimoyre')).toBe('ancient');
  });

  it('returns null when there is no prior word', () => {
    expect(extractPreviousWord('stel', 'stel')).toBeNull();
    expect(extractPreviousWord('', '')).toBeNull();
    expect(extractPreviousWord(null, 'x')).toBeNull();
  });

  it('ignores punctuation between words', () => {
    expect(extractPreviousWord('void, stel', 'stel')).toBe('void');
  });
});
