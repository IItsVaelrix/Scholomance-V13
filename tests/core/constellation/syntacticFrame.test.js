/**
 * The frame must ABSTAIN more readily than it decides. A tagger that guesses
 * "noun" on no evidence invents the very thing the caller needs evidence for,
 * and the caller here is a falsifier — a wrong confident answer is worse than
 * no answer.
 */
import { describe, it, expect } from 'vitest';
import { resolveSyntacticFrame, viableWordCount } from '../../../codex/core/constellation/syntacticFrame.js';

describe('resolveSyntacticFrame', () => {
  it('reads a determiner before the token as a noun', () => {
    const f = resolveSyntacticFrame(['the', 'wound', 'healed'], 'wound');
    expect(f.pos).toBe('n');
    expect(f.cue).toBe('determiner:the');
  });

  it('reads a subject pronoun before the token as a verb', () => {
    const f = resolveSyntacticFrame(['he', 'wound', 'the', 'clock'], 'wound');
    expect(f.pos).toBe('v');
    expect(f.cue).toBe('subject-or-aux:he');
  });

  it('reads a preposition as introducing a noun', () => {
    expect(resolveSyntacticFrame(['salt', 'in', 'the', 'wound'], 'wound').pos).toBe('n');
    expect(resolveSyntacticFrame(['blood', 'from', 'wound'], 'wound').cue).toBe('preposition:from');
  });

  it('falls back to a following object determiner for a transitive verb', () => {
    const f = resolveSyntacticFrame(['wound', 'the', 'clock'], 'wound');
    expect(f.pos).toBe('v');
    expect(f.cue).toBe('object-follows:the');
  });

  it('prefers the before-cue when both are present', () => {
    // "the wound the" — determiner attaches directly, object-follows must not win.
    const f = resolveSyntacticFrame(['the', 'wound', 'the', 'clock'], 'wound');
    expect(f.pos).toBe('n');
    expect(f.cue).toBe('determiner:the');
  });

  it('ABSTAINS on a bare word — the case a poet actually types', () => {
    const f = resolveSyntacticFrame(['wound'], 'wound');
    expect(f.pos).toBeNull();
    expect(f.cue).toBeNull();
  });

  it('abstains when neighbours carry no cue', () => {
    expect(resolveSyntacticFrame(['cold', 'wound', 'iron'], 'wound').pos).toBeNull();
  });

  it('abstains rather than throwing on malformed input', () => {
    expect(resolveSyntacticFrame(null, 'wound').pos).toBeNull();
    expect(resolveSyntacticFrame(['wound'], '').pos).toBeNull();
    expect(resolveSyntacticFrame(['a', 'b'], 'missing').index).toBe(-1);
  });
});

describe('viableWordCount', () => {
  const woundGroups = [{ pos: 'a' }, { pos: 'n' }, { pos: 'v' }];
  const bankGroups = [{ pos: 'n' }, { pos: 'v' }];

  it('counts one word when there is one pronunciation, however many POS groups', () => {
    // bank n/v is ONE word. POS multiplicity is not word multiplicity.
    expect(viableWordCount(1, bankGroups, null)).toBe(1);
    expect(viableWordCount(1, bankGroups, 'n')).toBe(1);
  });

  it('stays ambiguous for a heteronym with no frame', () => {
    expect(viableWordCount(2, woundGroups, null)).toBe(3);
  });

  it('resolves to one word when the frame picks a single group', () => {
    expect(viableWordCount(2, woundGroups, 'n')).toBe(1);
    expect(viableWordCount(2, woundGroups, 'v')).toBe(1);
  });

  it('stays ambiguous when the frame matches no group', () => {
    // frame says verb, but only a/n exist -> nothing was narrowed.
    expect(viableWordCount(2, [{ pos: 'a' }, { pos: 'n' }], 'v')).toBe(2);
  });

  it('returns null when phonology could not answer — absent is not one', () => {
    expect(viableWordCount(null, woundGroups, 'n')).toBeNull();
  });
});
