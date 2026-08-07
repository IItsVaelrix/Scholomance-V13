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
    const pos = new Map([['wound', ['n']], ['the', []], ['healed', ['v']]]);
    const r = compose(T('the wound healed'), pos);
    const woundAtoms = r.atoms.filter((a) => a.token === 'wound').map((a) => a.type);
    expect(woundAtoms).toContain('N');
    expect(woundAtoms).not.toContain('V');
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
