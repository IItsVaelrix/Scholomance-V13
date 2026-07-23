import { describe, it, expect } from 'vitest';
import { analyzeGenome, syllablesFromPhonemes } from '../../../codex/server/services/constellation/genome.adapter.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

describe('analyzeGenome', () => {
  it('counts syllables from ARPABET vowel phonemes', () => {
    expect(syllablesFromPhonemes(['M', 'AO1', 'R', 'N', 'IH0', 'NG'])).toBe(2);
    expect(syllablesFromPhonemes([])).toBe(0);
  });

  it('maps the backend dominant vowel family to a school', () => {
    const id = resolveQueryIdentity('morning');
    const g = analyzeGenome({ phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'], dominantVowelFamily: 'IY' }, id);
    expect(g.schoolHint).toBe('PSYCHIC'); // IY → PSYCHIC per schools.js
    expect(g.syllables).toBe(2);
  });

  it('flags alliteration when content tokens share a first letter', () => {
    const id = resolveQueryIdentity('silent silver sea');
    const g = analyzeGenome({ phonemes: [], dominantVowelFamily: null }, id);
    expect(g.devicesHint).toContain('alliteration');
  });

  it('returns a null school when there is no vowel family', () => {
    const id = resolveQueryIdentity('morning');
    const g = analyzeGenome({ phonemes: [], dominantVowelFamily: null }, id);
    expect(g.schoolHint).toBeNull();
    expect(g.devicesHint).toEqual([]);
  });

  it('is inert when the rhyme channel is null', () => {
    const id = resolveQueryIdentity('morning');
    const g = analyzeGenome(null, id);
    expect(g.syllables).toBe(0);
    expect(g.schoolHint).toBeNull();
  });
});
