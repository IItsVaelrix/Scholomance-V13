import { describe, it, expect } from 'vitest';
import { irregularPos } from '../../../codex/core/lexical-analysis/irregular-forms.js';
import { compose } from '../../../codex/core/constellation/compose.js';

const T = (s) => s.split(' ');

describe('irregular forms', () => {
  /**
   * The lexicon stores base forms plus REGULAR transforms, so every irregular
   * falls through it — and suffix backoff cannot help, because having no suffix
   * to read is what makes a form irregular in the first place.
   */
  it('types an irregular past that no suffix could reveal', () => {
    expect(irregularPos('came')).toEqual(['v']);
    expect(irregularPos('took')).toEqual(['v']);
    expect(irregularPos('brought')).toEqual(['v']);
  });

  /**
   * A past PARTICIPLE is verb and adjective both — `a broken window` and `he had
   * broken it`. The adjectival reading is what the reduced-relative bond
   * consumes, so collapsing it would remove the garden path from every irregular.
   */
  it('types a past participle as verb and adjective', () => {
    expect(irregularPos('broken').sort()).toEqual(['a', 'v']);
    expect(irregularPos('taken').sort()).toEqual(['a', 'v']);
  });

  it('types irregular plurals', () => {
    expect(irregularPos('children')).toEqual(['n']);
    expect(irregularPos('feet')).toEqual(['n']);
    expect(irregularPos('phenomena')).toEqual(['n']);
  });

  /** Not an irregular is not a guess — it is silence. */
  it('abstains on a regular word', () => {
    expect(irregularPos('table')).toEqual([]);
    expect(irregularPos('walked')).toEqual([]);
  });

  /**
   * PRECEDENCE. `wound` is the irregular past of `wind` AND a common noun. The
   * injected lexicon knows the noun and must win — a table that overrode the
   * lexicon would be reintroducing the heteronym problem the governor exists to
   * solve.
   */
  it('never overrides the injected lexicon', () => {
    const tokens = T('the wound healed');
    const pos = new Map([['wound', ['n']], ['the', []], ['healed', ['v']]]);
    const r = compose(tokens, pos);
    const at = tokens.indexOf('wound');

    /**
     * THE VERB READING IS ASSERTED AT THE ATOM LAYER, because that is the only
     * place the irregular table can speak: `atomsFor` pushes V iff the resolved
     * tags contain 'v'. If the table ever outranked the lexicon, a V atom is
     * precisely what would appear here.
     */
    const atoms = r.atoms.filter((a) => a.token === 'wound').map((a) => a.type);
    expect(atoms).not.toContain('V');

    /**
     * THE NOUN READING IS ASSERTED AT THE SPAN, one layer up. A pure noun
     * atomises to NC and reaches N through the NC->N lift — only a dual n+v
     * word emits N directly (see the N/NC split in atomsFor, which exists to
     * keep pure nouns out of compound chemistry). Probing r.atoms for 'N'
     * therefore tested the split rather than the precedence it meant to test.
     */
    const atSpan = r.molecules.filter((m) => m.from === at && m.to === at).map((m) => m.type);
    expect(atSpan).toContain('N');
    expect(atSpan).not.toContain('VP');
  });

  /**
   * THE WHOLE LADDER, ON ONE TOKEN.
   *
   * `tagsForForm` ranks three sources: injected lexicon > irregular table >
   * suffix guess. `wound` above only exercises the top rung, because the
   * suffix guesser is silent on it — so a defect that let MORPHOLOGY outrank
   * the lexicon produced output identical to correct code and no assertion
   * in this file could see it.
   *
   * `drive` is the token that separates all three: the table types it ['v']
   * (irregular of drove/driven) and the suffix guesser types it ['a'] off
   * -ive. The two disagree completely, so each rung yields a different atom —
   * NC if the lexicon wins, V if the table wins, ADJ if morphology wins.
   * 27 of the 382 irregular forms have this property; `drive` was chosen
   * because its two lower rungs share no tag at all.
   */
  describe('precedence ladder — lexicon > irregular table > suffix guess', () => {
    const tokens = T('the drive worked');
    const at = tokens.indexOf('drive');
    const atomsOf = (r) => r.atoms.filter((a) => a.token === 'drive').map((a) => a.type);
    const spanOf = (r) => r.molecules
      .filter((m) => m.from === at && m.to === at).map((m) => m.type);

    it('the lexicon outranks BOTH lower sources', () => {
      const pos = new Map([['drive', ['n']], ['the', []], ['worked', ['v']]]);
      const r = compose(tokens, pos);
      expect(atomsOf(r)).not.toContain('V');    // the table did not win
      expect(atomsOf(r)).not.toContain('ADJ');  // morphology did not win
      expect(spanOf(r)).toContain('N');         // the lexicon did
    });

    it('the table outranks the suffix guesser when the lexicon abstains', () => {
      const pos = new Map([['the', []], ['worked', ['v']]]);
      const r = compose(tokens, pos);
      expect(atomsOf(r)).toContain('V');        // the table spoke
      expect(atomsOf(r)).not.toContain('ADJ');  // morphology stayed below it
    });

    /**
     * An entry that is PRESENT BUT EMPTY means "the lexicon abstains", not
     * "typed as nothing" — the distinction a truthiness check cannot make,
     * since [] is truthy. Asserting it here keeps a future `known ? ... : ...`
     * from silently turning function-word entries into a veto.
     */
    it('reads an empty lexicon entry as abstention, not as a verdict', () => {
      const absent = compose(tokens, new Map([['the', []], ['worked', ['v']]]));
      const empty = compose(tokens, new Map([['drive', []], ['the', []], ['worked', ['v']]]));
      expect(atomsOf(empty)).toEqual(atomsOf(absent));
    });
  });

  it('lets a sentence parse on an irregular the lexicon lacks', () => {
    // `children` and `came` are deliberately absent from the POS map.
    const pos = new Map([['the', []]]);
    const r = compose(T('the children came'), pos);
    expect(r.stable.filter((m) => m.type === 'S').length).toBeGreaterThan(0);
  });

  /**
   * Archaic FUNCTION words live in the closed classes, not here — `unto` is a
   * preposition, `thy` a determiner, `hath` an auxiliary. Only archaic content
   * verbs (`saith`, `spake`) belong in the irregular table.
   */
  it('parses an archaic sentence through the closed classes', () => {
    const pos = new Map([['man', ['n']], ['hand', ['n']]]);
    const r = compose(T('he came unto the man'), pos);
    expect(r.stable.filter((m) => m.type === 'S').length).toBeGreaterThan(0);
  });
});
