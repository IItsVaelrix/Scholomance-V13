import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Spellchecker } from '../../codex/core/spellchecker.js';

describe('Spellchecker Accuracy & Edge Cases', () => {
  let spellchecker;

  beforeEach(() => {
    spellchecker = new Spellchecker();
    // Initialize with a robust "steroid" dictionary
    const robustLexicon = [
      'the', 'receive', 'separate', 'address', 'fruit', 'steal', 'steel',
      'grimoire', 'sigil', 'athame', 'ritual', 'scholomance', 'occult',
      'shadow', 'light', 'void', 'ancient', 'knowledge', 'wisdom',
      'through', 'thorough', 'thought', 'though', 'tough',
      'rhythm', 'rhyme', 'lyric', 'phonetic', 'syllable',
      'believe', 'neighbor', 'weight', 'height', 'weird',
      'occurrence', 'necessary', 'definitely', 'accommodate'
    ];
    spellchecker.init(robustLexicon);

    // Add some bigram context for "steroid" logic
    spellchecker.rememberSequence('to', 'steal', 10);
    spellchecker.rememberSequence('the', 'steel', 10);
    spellchecker.rememberSequence('ancient', 'grimoire', 5);
    spellchecker.rememberSequence('perform', 'ritual', 5);
  });

  it('handles common transpositions (hte -> the)', () => {
    const suggestions = spellchecker.suggest('hte');
    expect(suggestions).toContain('the');
    expect(suggestions[0]).toBe('the');
  });

  it('handles "i before e" and common misspellings (recive -> receive)', () => {
    const suggestions = spellchecker.suggest('recive');
    expect(suggestions).toContain('receive');
  });

  it('handles vowels in "separate" (seperate -> separate)', () => {
    const suggestions = spellchecker.suggest('seperate');
    expect(suggestions).toContain('separate');
  });

  it('handles double consonants (adress -> address)', () => {
    const suggestions = spellchecker.suggest('adress');
    expect(suggestions).toContain('address');
  });

  it('handles phonetic misspellings (froot -> fruit)', () => {
    // froot and fruit share phonetic key in many encoders
    const suggestions = spellchecker.suggest('froot');
    expect(suggestions).toContain('fruit');
  });

  it('utilizes bigram context for disambiguation (to stel -> to steal)', () => {
    const suggestions = spellchecker.suggest('stel', 5, 'to');
    // 'steal' should be ranked higher than 'steel' due to bigram 'to steal'
    expect(suggestions).toContain('steal');
    expect(suggestions).toContain('steel');
    expect(suggestions.indexOf('steal')).toBeLessThan(suggestions.indexOf('steel'));
  });

  it('utilizes bigram context for disambiguation (the stel -> the steel)', () => {
    const suggestions = spellchecker.suggest('stel', 5, 'the');
    expect(suggestions).toContain('steel');
    expect(suggestions.indexOf('steel')).toBeLessThan(suggestions.indexOf('steal'));
  });

  it('handles ritualistic and arcane vocabulary (grimoyre -> grimoire)', () => {
    const suggestions = spellchecker.suggest('rimoyre');
    expect(suggestions).toContain('grimoire');
  });

  it('handles ritualistic vocabulary with bigram help (ancient grimoyre)', () => {
    const suggestions = spellchecker.suggest('grimoyre', 5, 'ancient');
    expect(suggestions[0]).toBe('grimoire');
  });

  it('handles "tough" words (throug -> through)', () => {
    const suggestions = spellchecker.suggest('throug');
    expect(suggestions).toContain('through');
  });

  it('does not suggest for correctly spelled words', () => {
    const suggestions = spellchecker.suggest('scholomance');
    expect(suggestions).toHaveLength(0);
  });

  it('handles long words with higher edit distance (definitly -> definitely)', () => {
    const suggestions = spellchecker.suggest('definitly');
    expect(suggestions).toContain('definitely');
  });

  it('integrates with async dictionary (steroid mode simulation)', async () => {
    const mockSuggest = vi.fn().mockResolvedValue(['extravagant', 'extraordinary']);
    spellchecker.configureAsync({
      suggestWords: mockSuggest
    });

    const suggestions = await spellchecker.suggestAsync('extranory', 5);
    expect(mockSuggest).toHaveBeenCalled();
    expect(suggestions).toContain('extraordinary');
  });

  it('suggestDetailed returns ranked scores instead of bare words', () => {
    const ranked = spellchecker.suggestDetailed('stel', 5, 'to');
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]).toEqual(expect.objectContaining({
      word: 'steal',
      score: expect.any(Number),
    }));
    expect(ranked[0].score).toBeGreaterThan(0);
    const steal = ranked.find((entry) => entry.word === 'steal');
    const steel = ranked.find((entry) => entry.word === 'steel');
    expect(steal.score).toBeGreaterThan(steel.score);
  });
});

