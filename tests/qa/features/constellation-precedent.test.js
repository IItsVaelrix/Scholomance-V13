import { describe, it, expect } from 'vitest';
import { caseKey, citePrecedent, precedentCue } from '../../../codex/core/constellation/precedent.js';

/** A tiny case book. In production these are rulings a human actually made. */
const BOOK = [
  {
    id: 'case-0001',
    key: caseKey(['And', 'his', 'chains', 'fell', 'off', 'from', 'his', 'hands']),
    ruling: { chains: 'n', fell: 'v', hands: 'n' },
    rationale: 'chains is the subject; fell is its finite verb',
    authority: 'hand-annotated 2026-08-07',
  },
];

describe('precedent', () => {
  /**
   * A CASE IS CITED BY EXACT MATCH, NEVER BY RESEMBLANCE.
   *
   * This is the line the whole design rests on. Looking up a ruling that was
   * actually made is injected data — the same class as the POS table. Retrieving
   * "the nearest precedent" would be inference over cases, which is a learned
   * ranker, which is the thing measurement rejected repeatedly.
   */
  it('cites a ruling for the exact input it was made on', () => {
    const c = citePrecedent(['And', 'his', 'chains', 'fell', 'off', 'from', 'his', 'hands'], BOOK);
    expect(c).not.toBeNull();
    expect(c.id).toBe('case-0001');
  });

  it('normalises case and spacing, which are not part of the input', () => {
    expect(citePrecedent(['and', 'his', 'CHAINS', 'fell', 'off', 'from', 'his', 'hands'], BOOK).id)
      .toBe('case-0001');
  });

  /** One word different is a DIFFERENT CASE. No analogy, no nearest-neighbour. */
  it('refuses to cite a merely similar sentence', () => {
    expect(citePrecedent(['And', 'his', 'chains', 'fell', 'off', 'from', 'her', 'hands'], BOOK))
      .toBeNull();
  });

  it('abstains on an input it has never ruled on', () => {
    expect(citePrecedent(['the', 'dog', 'ran'], BOOK)).toBeNull();
  });

  it('cannot invent a case that is not in the book', () => {
    expect(citePrecedent(['the', 'dog', 'ran'], [])).toBeNull();
    expect(citePrecedent(['the', 'dog', 'ran'], null)).toBeNull();
  });

  describe('as a cue', () => {
    const tokens = ['And', 'his', 'chains', 'fell', 'off', 'from', 'his', 'hands'];
    const molecules = [
      { id: 'right', leaves: [['chains', 'N'], ['fell', 'V'], ['hands', 'N']] },
      { id: 'wrong', leaves: [['chains', 'V'], ['fell', 'V'], ['hands', 'V']] },
    ];
    // The accessor is where vocabulary translation lives: rulings are written in
    // POS letters, the chart speaks categories, and the adapter reconciles them.
    // The cue itself never learns how a molecule is shaped.
    const CATEGORY_POS = { N: 'n', V: 'v', ADJ: 'a', ADV: 'r' };
    const assign = (m) => new Map(m.leaves.map(([t, c]) => [t, CATEGORY_POS[c] || c]));

    it('supports the molecule the ruling endorses, and names the case', () => {
      const v = precedentCue(tokens, molecules, BOOK, assign);
      expect(v.verdict).toBe('support');
      expect(v.payload.molecule.id).toBe('right');
      expect(v.payload.citation).toBe('case-0001');
    });

    /**
     * ABSTENTION, NOT A GUESS. An uncited input is "no ruling exists", which is a
     * different fact from "every reading is equally good" — the distinction this
     * codebase keeps everywhere else.
     */
    it('abstains rather than guessing when no case covers the input', () => {
      expect(precedentCue(['the', 'dog', 'ran'], molecules, BOOK, assign).verdict).toBe('abstain');
    });

    /**
     * A ruling that fits NO available molecule is a contradiction between the
     * case book and the grammar, and saying so beats silently picking something.
     */
    it('abstains when the ruling matches no molecule on offer', () => {
      const none = [{ id: 'other', leaves: [['chains', 'V'], ['fell', 'N'], ['hands', 'V']] }];
      expect(precedentCue(tokens, none, BOOK, assign).verdict).toBe('abstain');
    });
  });
});
