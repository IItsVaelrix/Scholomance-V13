/**
 * The canonical tokenizer is only adoptable if its legacy projections are
 * byte-identical to the tokenizers they replace. That is not asserted on
 * hand-picked strings — it is asserted against real Project Gutenberg prose,
 * because the whole reason this module exists is that hand-picked strings
 * hid the contraction and compound damage for months.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import {
  tokenizeCanonical,
  projectCoreTokens,
  projectCorpusTokens,
  projectBoundUnits,
  projectRepairedTokens,
  VALENCE,
} from '../../codex/core/canonical-tokenizer.js';

/** A stub lexicon. Real words in, fragments out. */
const WORDS = new Set([
  'apple', 'heavenly', 'thistle', 'meadow', 'man', 'of', 'war', 'by', 'and',
  'peach', 'tree', 'spy', 'glass', 'short', 'sighted', 'news', 'paper',
  'newspaper', 'wolf', 'dog', 'good', 'well', 'nigh', 'goodly',
]);
const isKnownWord = (w) => WORDS.has(w);

/** The two legacy implementations, copied verbatim as the reference oracle. */
const legacyCore = (t) => (t ? t.toLowerCase().match(/\b(\w+)\b/g) || [] : []);
const legacyCorpus = (t) => t.toLowerCase().match(/[a-z']+/g) || [];

const GUTENBERG = '/home/deck/Downloads/Scholomance-V12-main/cache/gutenberg';

describe('valence', () => {
  it('reads a hyphen as the author declaring a compound', () => {
    const u = tokenizeCanonical('a peach-tree').units.find((x) => x.pieces.length === 2);
    expect(u.valence).toBe(VALENCE.COMPOUND);
    expect(u.pieces).toEqual(['peach', 'tree']);
  });

  it('chains a multi-hyphen compound into one unit', () => {
    const u = tokenizeCanonical('mother-in-law').units[0];
    expect(u.valence).toBe(VALENCE.COMPOUND);
    expect(u.pieces).toEqual(['mother', 'in', 'law']);
  });

  /** Gutenberg uses `--` for an em-dash constantly. It separates, never binds. */
  it('reads a double hyphen as a dash, not a compound', () => {
    const units = tokenizeCanonical('him--and her').units;
    expect(units.some((u) => u.valence === VALENCE.DASH)).toBe(true);
    expect(units.some((u) => u.valence === VALENCE.COMPOUND)).toBe(false);
  });

  it('binds the negation clitic instead of shredding it', () => {
    const u = tokenizeCanonical("don't").units[0];
    expect(u.valence).toBe(VALENCE.CLITIC);
    expect(u.clitic).toBe('not');
    expect(u.pieces).toEqual(['don', 't']);
  });

  it('binds auxiliary clitics', () => {
    for (const [s, c] of [["we'll", 'll'], ["I've", 've'], ["they're", 're'], ["I'm", 'm']]) {
      expect(tokenizeCanonical(s).units[0].clitic).toBe(c);
    }
  });

  /** The line this module will not cross: `'s` is not decidable from spelling. */
  it("refuses to decide 's, and says what the candidates are", () => {
    const u = tokenizeCanonical("the sea's edge").units.find((x) => x.pieces.length === 2);
    expect(u.valence).toBe(VALENCE.AMBIGUOUS);
    expect(u.candidates).toEqual([VALENCE.GENITIVE, VALENCE.CLITIC]);
  });

  it('reads a trailing apostrophe on a plural as a genitive', () => {
    const u = tokenizeCanonical("the boys' coats").units.find((x) => x.pieces[0] === 'boys');
    expect(u.valence).toBe(VALENCE.GENITIVE);
    expect(u.trailingApos).toBe(true);
  });

  it('reads a leading apostrophe as an elision', () => {
    const u = tokenizeCanonical("'tis done").units[0];
    expect(u.valence).toBe(VALENCE.CLITIC);
    expect(u.leadingApos).toBe(true);
  });

  it('surfaces bound units as single lexical items', () => {
    const p = tokenizeCanonical('the new-mown hay by the peach-tree');
    expect(projectBoundUnits(p)).toEqual(['new-mown', 'peach-tree']);
  });
});

describe('fractured words (the two-condition test)', () => {
  const v = (s) => tokenizeCanonical(s, { isKnownWord }).units.find((u) => u.pieces.length > 1);

  it('heals a word broken by typesetting', () => {
    const u = v('the ap-ple fell');
    expect(u.valence).toBe(VALENCE.FRACTURED);
    expect(u.canonical).toBe('apple');
  });

  it('heals a word broken at every syllable', () => {
    expect(v('hea-ven-ly').valence).toBe(VALENCE.FRACTURED);
    expect(v('hea-ven-ly').canonical).toBe('heavenly');
  });

  /**
   * THE CASE A NAIVE REJOIN RULE DESTROYS. 81.8% of Gutenberg compounds have
   * every piece a known word, and all of them look like this.
   */
  it('refuses to fuse a real compound whose pieces are words', () => {
    expect(v('man-of-war').valence).toBe(VALENCE.COMPOUND);
    expect(v('man-of-war').canonical).toBe('man-of-war');
    expect(v('by-and-by').valence).toBe(VALENCE.COMPOUND);
    expect(v('peach-tree').canonical).toBe('peach-tree');
  });

  /** Condition 2 alone: two fragments that join into nothing stay broken. */
  it('refuses to weld fragments that do not spell a word', () => {
    expect(v('xor-quib').valence).toBe(VALENCE.COMPOUND);
  });

  /**
   * THE CASE THE STRICT RULE MISSED. Syllabified text constantly leaves a
   * fragment that coincidentally spells a word, so requiring EVERY piece to be
   * unknown left `fa-ther`, `wa-ter` and `ev-e-ry` unhealed. Measured: strict
   * healed 38 of 3,410 Gutenberg compounds, this heals 233.
   */
  it('heals when only some pieces coincidentally spell words', () => {
    // `good` is a word, `ly` is not, and `goodly` is — strict would refuse.
    expect(v('good-ly').valence).toBe(VALENCE.FRACTURED);
    expect(v('good-ly').canonical).toBe('goodly');
  });

  /** Condition 2 is what protects compounds containing function words. */
  it('leaves a compound alone when the join is not a word', () => {
    // `of` is absent from a content-word lexicon, so condition 1 passes here —
    // only `manofwar` not being a word keeps this compound intact.
    const u = tokenizeCanonical('man-of-war', { isKnownWord: (w) => w !== 'of' && WORDS.has(w) })
      .units[0];
    expect(u.valence).toBe(VALENCE.COMPOUND);
    expect(u.canonical).toBe('man-of-war');
  });

  /** Fail closed: no lexicon, no repair claim. */
  it('never reports fractured without a lexicon predicate', () => {
    const u = tokenizeCanonical('hea-ven-ly').units[0];
    expect(u.valence).toBe(VALENCE.COMPOUND);
  });

  it('binds a hyphen swallowed by a line break', () => {
    const u = v('the spy-\r\nglass fell');
    expect(u.lineBroken).toBe(true);
    // Both pieces are words, so this is a compound that merely broke at its own
    // hyphen — not a fractured word.
    expect(u.valence).toBe(VALENCE.COMPOUND);
  });

  it('heals a fractured word across a line break', () => {
    const u = v('the ap-\r\nple fell');
    expect(u.lineBroken).toBe(true);
    expect(u.valence).toBe(VALENCE.FRACTURED);
    expect(u.canonical).toBe('apple');
  });

  it('repairs the stream a corpus builder counts', () => {
    const p = tokenizeCanonical('the ap-ple by the peach-tree', { isKnownWord });
    expect(projectRepairedTokens(p)).toEqual(['the', 'apple', 'by', 'the', 'peach-tree']);
    // Today's tokenizer loses `apple` entirely and invents `ap` and `ple`.
    expect(projectCoreTokens(p)).toEqual(['the', 'ap', 'ple', 'by', 'the', 'peach', 'tree']);
  });
});

describe('legacy projections are byte-identical', () => {
  const cases = [
    "don't go",
    "the boys' coats",
    'mother-in-law',
    'him--and her',
    'rock and roll',
    "'tis the season",
    'abc123def ghi',
    'snake_case_word',
    '   ',
    '',
    'Hello, World! How are you?',
    "the sea's edge and the sky's",
    'well-nigh to-day sea-shore',
    'a — b – c',
  ];

  it.each(cases)('core view matches \\b\\w+\\b on %j', (s) => {
    expect(projectCoreTokens(tokenizeCanonical(s))).toEqual(legacyCore(s));
  });

  it.each(cases)("corpus view matches [a-z']+ on %j", (s) => {
    expect(projectCorpusTokens(tokenizeCanonical(s))).toEqual(legacyCorpus(s));
  });
});

describe('legacy projections against real Gutenberg prose', () => {
  const available = existsSync(GUTENBERG);

  it.skipIf(!available)('reproduces both legacy streams over many books', () => {
    const files = readdirSync(GUTENBERG).filter((f) => f.endsWith('.txt'));
    expect(files.length).toBeGreaterThan(0);

    // Deterministic spread across the shelf, not the first N (which share a genre).
    const picked = [];
    for (let i = 0; i < 12; i += 1) picked.push(files[Math.floor((i * files.length) / 12)]);

    let checkedChars = 0;
    for (const f of picked) {
      let text;
      try { text = readFileSync(`${GUTENBERG}/${f}`, 'utf8').slice(20000, 90000); } catch { continue; }
      if (!text) continue;
      checkedChars += text.length;

      /**
       * WITH the lexicon predicate active, so the fracture repair is proven not
       * to disturb the streams it must remain substitutable for. A projection
       * that only matched with the feature switched off would be worthless.
       */
      const packet = tokenizeCanonical(text, { isKnownWord });
      expect(projectCoreTokens(packet), `core view diverged in ${f}`).toEqual(legacyCore(text));
      expect(projectCorpusTokens(packet), `corpus view diverged in ${f}`).toEqual(legacyCorpus(text));
    }
    expect(checkedChars).toBeGreaterThan(500000);
  });

  it.skipIf(!available)('recovers compounds the legacy tokenizers destroyed', () => {
    const files = readdirSync(GUTENBERG).filter((f) => f.endsWith('.txt'));
    const text = readFileSync(`${GUTENBERG}/${files[Math.floor(files.length / 2)]}`, 'utf8')
      .slice(20000, 220000);

    const packet = tokenizeCanonical(text);
    const bound = projectBoundUnits(packet);
    // The legacy core view cannot contain a hyphenated unit at all.
    expect(legacyCore(text).some((t) => t.includes('-'))).toBe(false);
    expect(bound.length).toBeGreaterThan(50);
    expect(bound.every((b) => b.includes('-'))).toBe(true);

    // And contractions survive as one unit instead of becoming `don` + `t`.
    const clitics = packet.units.filter((u) => u.valence === VALENCE.CLITIC);
    expect(clitics.length).toBeGreaterThan(0);
  });
});
