import { describe, it, expect } from 'vitest';
import {
  compose, projectAnswer, guessPos, rankByAttraction, validateBonds,
} from '../../../codex/core/constellation/compose.js';

const pos = new Map([
  ['stars', ['n']], ['burn', ['n', 'v']], ['bright', ['a', 'r']],
  ['horse', ['n', 'v']], ['raced', ['v']], ['past', ['a', 'n', 'r']],
  ['barn', ['n']], ['fell', ['a', 'n', 'v']],
  ['man', ['n']], ['saw', ['n', 'v']], ['comet', ['n']],
  ['water', ['n', 'v']], ['runs', ['n', 'v']], ['deep', ['a', 'n', 'r']],
  ['dog', ['n']], ['chased', ['v']], ['cat', ['n']], ['garden', ['n']],
  ['old', ['a']], ['ran', ['v']], ['tired', ['a']], ['quickly', ['r']],
  ['wants', ['v']], ['run', ['n', 'v']], ['left', ['a', 'n', 'v']], ['came', ['v']],
  ['older', ['a']], ['boy', ['n']], ['hat', ['n']],
  ['men', ['n']], ['cold', ['a', 'n']], ['grey', ['a']],
  ['wood', ['n']], ['shadows', ['n', 'v']], ['fall', ['n', 'v']], ['road', ['n']],
  ['dark', ['a', 'n', 'v']], ['happy', ['a']], ['she', []], ['left', ['a','n','v']],
  ['gave', ['v']], ['ghost', ['n', 'v']], ['picked', ['v']], ['chains', ['n', 'v']],
  ['very', ['r']], ['good', ['a', 'n']], ['enough', ['a', 'r']], ['just', ['a', 'r']],
  ['answered', ['v']], ['likely', ['a', 'r']], ['go', ['n', 'v']], ['name', ['n', 'v']],
  ['hill', ['n']], ['see', ['n', 'v']],
]);
const T = (s) => s.split(' ');

describe('compose', () => {
  /**
   * THE SMALLEST BOND. `stars` types as a nominal, `burn` as a verb, and the
   * one rule that joins them spans the whole input. If atoms do not bond here
   * they do not bond anywhere, and no field would rescue them.
   */
  it('bonds a nominal and a verb into a molecule spanning the input', () => {
    const r = compose(T('stars burn'), pos);
    expect(r.stable).toHaveLength(1);
    expect(r.stable[0].type).toBe('S');
    expect(r.stable[0].from).toBe(0);
    expect(r.stable[0].to).toBe(1);
  });

  /** Every type appearing anywhere inside a molecule. */
  const types = (m) => (m.parts.length === 0
    ? [m.type]
    : [m.type, ...m.parts.flatMap(types)]);

  /**
   * THE GARDEN PATH, SETTLED BY COVERAGE RATHER THAN BY PREFERENCE.
   *
   * `the horse raced past the barn` is a well-formed S on its own. It is not
   * rejected for being unlikely or for scoring badly — it is rejected because
   * it leaves `fell` bonded to nothing, and a molecule that does not span the
   * input is not a reading of the input. The surviving structure is the one
   * where `raced past the barn` is a participle modifying `horse`, which is
   * exactly the reduced relative a human arrives at after the lurch.
   */
  it('leaves exactly one stable molecule for the garden path — the reduced relative', () => {
    const r = compose(T('the horse raced past the barn fell'), pos);
    expect(r.stable).toHaveLength(1);
    expect(types(r.stable[0])).toContain('PART');
  });

  /**
   * The rival is REAL, and must be visible as a molecule that simply fails to
   * span. If it were absent the coverage test would be vacuous — passing
   * because nothing competed rather than because something lost.
   */
  it('builds the main-clause rival but does not let it span', () => {
    const r = compose(T('the horse raced past the barn fell'), pos);
    const rival = r.molecules.find((m) => m.type === 'S' && m.from === 0 && m.to === 5);
    expect(rival).toBeDefined();
    expect(r.stable).not.toContain(rival);
  });

  const spanningS = (r) => r.stable.filter((m) => m.type === 'S');

  it('composes a transitive clause', () => {
    expect(spanningS(compose(T('the man saw a comet'), pos))).toHaveLength(1);
  });

  /**
   * `deep` is tagged BOTH adjective and noun, so `water runs deep` and `water
   * runs the deep` are both real. Asserting a count here would be asserting my
   * own guess; what the rule owes is that a predicative reading EXISTS.
   */
  it('composes a predicative adjective', () => {
    const s = spanningS(compose(T('water runs deep'), pos));
    expect(s.some((m) => types(m).includes('ADJ'))).toBe(true);
  });

  /**
   * THE AMBIGUITY THIS BUYS, STATED HONESTLY.
   *
   * Once a PP can attach to either a verb phrase or a noun phrase, `through the
   * garden` has two homes — chasing that happened in the garden, or a cat that
   * was in it. Both are well-formed and both span. This is the Catalan
   * generator, and two readings here is CORRECT, not a defect: the sentence
   * really is ambiguous. What matters is whether the count stays bounded as
   * sentences grow, which is measured separately.
   */
  it('yields both attachments when a PP can bond to either verb or noun', () => {
    expect(spanningS(compose(T('the dog chased the cat through the garden'), pos))).toHaveLength(2);
  });

  /**
   * PROJECTION — the operation that makes parse count irrelevant.
   *
   * A parse is a structure; a consumer wants an answer. `projectAnswer` reduces
   * a molecule to the pair `readings.js` actually asks about, so two parses that
   * disagree only about where a PP hangs collapse to one answer.
   */
  it('projects a parse to its subject and verb', () => {
    const [s] = spanningS(compose(T('the dog chased the cat'), pos));
    expect(projectAnswer(s)).toEqual({ subject: 'dog', verb: 'chased' });
  });

  /**
   * The garden path projects to `horse | fell` — subject of the LATER verb,
   * which is the reduced-relative reading and the one a human lands on.
   */
  it('projects the garden path onto the later verb', () => {
    const [s] = spanningS(compose(T('the horse raced past the barn fell'), pos));
    expect(projectAnswer(s)).toEqual({ subject: 'horse', verb: 'fell' });
  });

  /**
   * THE CLAIM THE WHOLE ARGUMENT RESTS ON. Both attachments of `through the
   * garden` are well-formed and both survive, and they give the SAME answer.
   * Structural ambiguity that no consumer can observe is not ambiguity.
   */
  it('collapses both PP attachments to one answer', () => {
    const s = spanningS(compose(T('the dog chased the cat through the garden'), pos));
    expect(s).toHaveLength(2);
    const answers = new Set(s.map((m) => JSON.stringify(projectAnswer(m))));
    expect(answers.size).toBe(1);
  });

  /**
   * COVERAGE RULES. Measured on 2,995 real sentences, the 10-rule grammar parsed
   * 0.9%, and 97.5% of the sentences whose every token was ALREADY typed still
   * had no derivation. These are the missing combinations, each one a shape that
   * appeared in that failure set.
   */
  it('composes an attributive adjective', () => {
    expect(spanningS(compose(T('the old man fell'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a pronoun subject', () => {
    expect(spanningS(compose(T('he ran'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a copula with a predicate adjective', () => {
    expect(spanningS(compose(T('the man was tired'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a relative clause', () => {
    expect(spanningS(compose(T('the man who ran fell'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a coordinated subject', () => {
    expect(spanningS(compose(T('the dog and the cat ran'), pos)).length).toBeGreaterThan(0);
  });

  it('composes an adverb modifying a verb', () => {
    expect(spanningS(compose(T('he ran quickly'), pos)).length).toBeGreaterThan(0);
  });

  /**
   * SUFFIX BACKOFF. 11.4% of real tokens have no `lemma_form` entry, and that
   * blocked 66.9% of parse failures. English derivational morphology is
   * orthographic and rule-governed, so a word absent from the table still
   * declares its category in its ending.
   *
   * This is NOT phonemic. `knight` and `night` sound identical and these rules
   * treat them differently, which is the point — spelling carries morphology
   * that sound does not.
   */
  describe('guessPos', () => {
    it('reads -ness as a noun', () => expect(guessPos('gladness')).toContain('n'));
    it('reads -ify as a verb', () => expect(guessPos('beautify')).toContain('v'));
    it('reads -ous as an adjective', () => expect(guessPos('perilous')).toContain('a'));
    it('reads -ly as an adverb', () => expect(guessPos('sombrely')).toContain('r'));

    /**
     * `-ed` is genuinely both — `the tired man` and `he tired`. Returning one
     * would be inventing a distinction the suffix does not make.
     */
    it('reads -ed as both verb and adjective', () => {
      expect(guessPos('bewildered').sort()).toEqual(['a', 'v']);
    });

    /** No recognised ending means no claim, not a default guess. */
    it('abstains on a word with no morphological signal', () => {
      expect(guessPos('xylph')).toEqual([]);
    });
  });

  it('parses a sentence whose content word is absent from the POS table', () => {
    // `gladness` is deliberately NOT in the fixture map above.
    expect(spanningS(compose(T('the gladness fell'), pos)).length).toBeGreaterThan(0);
  });

  /**
   * PROPER NOUNS BY CAPITALISATION.
   *
   * Names dominated the unresolved tokens in the corpus run — sampson, alvarez,
   * jim, ghek — and no lexicon or suffix will ever hold them. Capitalisation
   * types them for free, but ONLY away from the sentence edge: English
   * capitalises every sentence-initial word, so position 0 carries no
   * information about the word and treating it as a name would type half the
   * corpus as people.
   */
  it('types a mid-sentence capitalised unknown as a nominal', () => {
    expect(spanningS(compose(T('the man saw Alvarez'), pos)).length).toBeGreaterThan(0);
  });

  it('does not treat a sentence-initial capital as a proper noun', () => {
    // `The` is capitalised only because it starts the sentence.
    const r = compose(T('The man fell'), pos);
    expect(spanningS(r).length).toBeGreaterThan(0);
    expect(r.atoms.some((a) => a.type === 'PROPN')).toBe(false);
  });

  /**
   * A capitalised word at position 0 that the lexicon does not know is still a
   * name — the ambiguity only bites for words that could be common.
   */
  it('accepts a sentence-initial capital the lexicon has never seen', () => {
    expect(spanningS(compose(T('Alvarez fell'), pos)).length).toBeGreaterThan(0);
  });

  /**
   * THE FOUR CONSTRUCTIONS THE FAILURE SET NAMED.
   *
   * Measured over 1,712 sentences that failed with every token already typed:
   * infinitives appeared in 10.9% of failures and 0.0% of successes — not one
   * parsed sentence in 305 contained one. Subordinators over-represented 6.7x,
   * comparatives 6.6x, possessives 3.0x. Negation, existentials and wh-questions
   * were NOT over-represented and are deliberately absent from this list.
   */
  it('composes an infinitive complement', () => {
    expect(spanningS(compose(T('he wants to run'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a subordinate clause', () => {
    expect(spanningS(compose(T('he left because she came'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a comparative', () => {
    expect(spanningS(compose(T('the man is older than the boy'), pos)).length).toBeGreaterThan(0);
  });

  it('composes a possessive', () => {
    expect(spanningS(compose(T("the man's hat fell"), pos)).length).toBeGreaterThan(0);
  });

  /**
   * A SPLIT POSSESSIVE, which is what a correct tokenizer produces.
   *
   * `the man's hat` possesses across a whole noun phrase, not just the adjacent
   * noun — in `the old man's hat` it is the OLD MAN who owns it. Splitting the
   * clitic makes that structure expressible; keeping it glued to `man` cannot.
   */
  it('composes a possessive split into its own token', () => {
    expect(spanningS(compose(T("the man 's hat fell"), pos)).length).toBeGreaterThan(0);
  });

  it('scopes the possessive over the whole noun phrase', () => {
    expect(spanningS(compose(T("the old man 's hat fell"), pos)).length).toBeGreaterThan(0);
  });

  /**
   * DISCOURSE-INITIAL COORDINATION — the largest single blocker in the corpus.
   *
   * 148 sentences composed across their ENTIRE length and still failed, because
   * coordination only attached rightward (`S + CONJS -> S`) and a sentence
   * opening with `And` or `But` has nothing on its left to bond to. The
   * conjunction is joining this sentence to the previous one, which is outside
   * the input entirely.
   */
  it('composes a sentence opening with a coordinating conjunction', () => {
    expect(spanningS(compose(T('and the dog ran'), pos)).length).toBeGreaterThan(0);
  });

  /**
   * UNARY CLOSURE MUST APPLY AT EVERY SPAN, NOT ONLY AT SINGLE TOKENS.
   *
   * `ADJ + N -> N` builds a two-token nominal, and nothing lifted it to NP, so
   * a bare plural with a modifier could not head a clause. A determiner masked
   * the bug entirely — `DET + N -> NP` reaches NP directly — which is why every
   * earlier test passed while `old men fell` silently failed.
   */
  it('lifts a multi-token nominal, not just a bare noun', () => {
    expect(spanningS(compose(T('old men fell'), pos)).length).toBeGreaterThan(0);
  });

  it('lifts a nominal under stacked modifiers', () => {
    expect(spanningS(compose(T('cold grey water runs deep'), pos)).length).toBeGreaterThan(0);
  });

  /**
   * THE ROOT IS DECLARED, NOT GUESSED.
   *
   * `stable` used to mean "spans the input", which conflated two things: a
   * complete clause, and a phrase that merely happens to cover every token.
   * `shadows fall across the road` spans as an S (the shadows fall) AND as an NP
   * (shadows fallen across the road), and reporting both as stable told a caller
   * asking for a sentence that its sentence was ambiguous when it was not.
   *
   * The caller knows what it asked for. ConstellationOS queries a bare noun
   * phrase as often as a clause, so neither root can be assumed globally.
   */
  /**
   * FUNCTION WORDS CARRY FEATURES, NOT JUST MEMBERSHIP.
   *
   * A flat closed class says a word IS an auxiliary or IS a pronoun and stops
   * there, and that under-specification over-generates: measured, six of six
   * ungrammatical strings parsed. `will` inherited the copula rules because it
   * sat in the same bucket as `is`, and `him` could head a subject because it
   * sat in the same bucket as `he`.
   *
   * A closed class is finite, so its features are enumerable too — this costs a
   * list, not a model.
   */
  describe('function-word features', () => {
    const parses = (s, opts) => compose(T(s), pos, opts).stable.length > 0;

    it('lets a copula take a predicate adjective', () => {
      expect(parses('he is happy')).toBe(true);
    });

    it('refuses a modal with a predicate adjective', () => {
      expect(parses('he will happy')).toBe(false);
      expect(parses('he can happy')).toBe(false);
    });

    it('still lets a modal take a verb', () => {
      expect(parses('he can run')).toBe(true);
    });

    it('lets a nominative pronoun head a subject', () => {
      expect(parses('he ran')).toBe(true);
    });

    it('refuses an accusative pronoun as a subject', () => {
      expect(parses('him ran')).toBe(false);
      expect(parses('them ran')).toBe(false);
    });

    it('still lets an accusative pronoun be an object', () => {
      expect(parses('the man saw him')).toBe(true);
    });
  });

  /**
   * ATTRACTION RANKING — orders parses, never removes them.
   *
   * Measured first: pruning atoms by the same signal traded coverage for
   * precision along a curve with no free point (2x pruning halved worst-case
   * parses from 932 to 496 and cost 5.2 points of coverage). Ranking keeps
   * every legal parse, so coverage is untouched and the caller decides.
   *
   * This is the rule already written into this module — bonds create, the field
   * only ranks. A weight that could REMOVE a structure would be learned state
   * acting as grammar.
   */
  /**
   * COMMA CONSTRUCTIONS.
   *
   * Link Grammar — 30 years of hand-curated English — spends more of its
   * dictionary on comma connectors (Xc, Xd: 1,522 uses) than on objects (O: 327).
   * The corpus harness had been DELETING commas, and the failure sample was full
   * of exactly the constructions commas carry: fronted adjuncts, appositives,
   * quotative inversion, list coordination.
   */
  describe('comma constructions', () => {
    const has = (s) => spanningS(compose(T(s), pos)).length > 0;

    it('composes a fronted adverbial', () => {
      expect(has('quickly , the dog ran')).toBe(true);
    });

    it('composes a fronted subordinate clause', () => {
      expect(has('because she came , he left')).toBe(true);
    });

    it('composes an appositive', () => {
      expect(has('the dog , the old cat , ran')).toBe(true);
    });

    it('composes a comma-separated list', () => {
      expect(has('the dog , the cat and the man ran')).toBe(true);
    });

    it('composes loose clause juxtaposition', () => {
      expect(has('he ran , she fell')).toBe(true);
    });
  });

  /**
   * PARTICLES / PHRASAL VERBS.
   *
   * Link Grammar devotes 228 connectors (K) to these. Two appeared in the corpus
   * failure sample — `his chains fell off from his hands`, `pulled himself
   * together` — and neither parsed. A particle is not a preposition: `fell off
   * the horse` takes an object, `fell off` does not.
   */
  describe('particles', () => {
    const has = (s) => spanningS(compose(T(s), pos)).length > 0;

    it('composes a bare phrasal verb', () => {
      expect(has('he gave up')).toBe(true);
    });

    /** The particle joins the VERB, so the pair still takes an object. */
    it('composes a phrasal verb with an object', () => {
      expect(has('he gave up the ghost')).toBe(true);
    });

    /** English also separates them — the particle lands after the object. */
    it('composes a separated particle', () => {
      expect(has('he picked it up')).toBe(true);
    });

    it('composes the corpus case that failed', () => {
      expect(has('the chains fell off')).toBe(true);
    });
  });

  /**
   * BARE FRONTING AND IMPERATIVES — from the blocker sample after commas landed.
   *
   * `In his right hand he grasped a long sword` blocked AT the verb: the fronted
   * PP parsed, the clause parsed, and nothing joined them because every fronting
   * rule required a comma. `please do not speak any more` blocked at end-of-input
   * because an imperative has no subject, so `NP + VP -> S` can never fire.
   */
  describe('fronting and imperatives', () => {
    const has = (s) => spanningS(compose(T(s), pos)).length > 0;

    it('composes a fronted prepositional phrase without a comma', () => {
      expect(has('in the garden he ran')).toBe(true);
    });

    it('composes a fronted adverb without a comma', () => {
      expect(has('quickly the dog ran')).toBe(true);
    });

    it('composes a subjectless imperative', () => {
      expect(has('run')).toBe(true);
      expect(has('chased the cat')).toBe(true);
    });

    /**
     * An imperative S has ONE child, not two, and the projection has to say the
     * subject is ABSENT rather than crash reaching for it. The implied `you` is
     * not in the input, so inventing it would be the projection making up a
     * token the parse never saw.
     */
    it('projects an imperative with no subject', () => {
      const [s] = spanningS(compose(T('chased the cat'), pos));
      expect(projectAnswer(s)).toEqual({ subject: null, verb: 'chased' });
    });
  });

  /**
   * ADVERB AND VERB-MODIFIER PLACEMENT, from Link Grammar's connector inventory.
   *
   * Its `<ordinary-adv>` macro expands to `EE- or EF+ ... MVa-`, and
   * `<adv-adj-*>` to `EA+ or EE+`. Cross-checking those against this grammar
   * showed pre-verbal (Em), post-verbal (MVa) and adjective-modifying (EA) were
   * already covered, and four were not.
   */
  describe('adverb and verb-modifier placement', () => {
    const has = (s) => spanningS(compose(T(s), pos)).length > 0;

    /** EE — an adverb modifying another adverb. */
    it('composes an adverb modifying an adverb', () => {
      expect(has('he ran very quickly')).toBe(true);
    });

    /** EF — the post-adjective slot. */
    it('composes a post-adjective modifier', () => {
      expect(has('the man is good enough')).toBe(true);
    });

    /** EN — an adverb modifying a prepositional phrase. */
    it('composes an adverb modifying a prepositional phrase', () => {
      expect(has('he ran just over the hill')).toBe(true);
    });

    /** MVi — an infinitive as a post-verbal modifier, not a complement. */
    it('composes an infinitive modifying a verb phrase', () => {
      expect(has('he came to see the cat')).toBe(true);
    });
  });

  /**
   * THE THREE THE BLOCKER SAMPLE NAMED, after fronting and imperatives landed.
   *
   * `that` was the 4th most common blocking token (24), `to` the 2nd (57), and
   * inversion showed up as `Shall we go` / `Why can not we call`. Each was read
   * off the failure data, not guessed.
   */
  describe('complements and inversion', () => {
    const has = (s) => spanningS(compose(T(s), pos)).length > 0;

    /**
     * `that` as a COMPLEMENTIZER, not a relative pronoun. `he answered that the
     * name was new` embeds a whole clause as the verb's object — different from
     * `the man that ran`, where it introduces a modifier.
     */
    it('composes a that-complement clause', () => {
      expect(has('he answered that the man ran')).toBe(true);
    });

    it('still composes a relative clause with the same word', () => {
      expect(has('the man that ran fell')).toBe(true);
    });

    /** `likely to be true` — an infinitive completing an adjective. */
    it('composes an adjective taking an infinitive', () => {
      expect(has('the man is likely to run')).toBe(true);
    });

    /** Subject-aux inversion: the auxiliary precedes its subject. */
    it('composes a modal question', () => {
      expect(has('shall we go')).toBe(true);
    });

    it('composes a do-support question', () => {
      expect(has('did he run')).toBe(true);
    });

    it('composes a copular question', () => {
      expect(has('is he happy')).toBe(true);
    });
  });

  describe('rankByAttraction', () => {
    // `deep` is far more often an adjective than a noun; `runs` more often a verb.
    const senses = new Map([
      ['deep', { a: 5, n: 2 }],
      ['runs', { v: 16, n: 4 }],
      ['water', { n: 9, v: 3 }],
    ]);

    it('never removes a parse', () => {
      const r = compose(T('water runs deep'), pos);
      expect(rankByAttraction(r.stable, senses)).toHaveLength(r.stable.length);
    });

    it('prefers the reading built from each token\'s dominant sense', () => {
      const r = compose(T('water runs deep'), pos);
      expect(r.stable.length).toBeGreaterThan(1);
      const [top] = rankByAttraction(r.stable, senses);
      expect(types(top.molecule)).toContain('ADJ');
    });

    it('scores every parse, so a caller can see the margin', () => {
      const r = compose(T('water runs deep'), pos);
      const ranked = rankByAttraction(r.stable, senses);
      expect(ranked.every((x) => typeof x.score === 'number')).toBe(true);
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[ranked.length - 1].score);
    });

    /** No sense data is ABSTENTION, not a score of zero. */
    it('leaves order untouched when it has no sense data', () => {
      const r = compose(T('water runs deep'), pos);
      const ranked = rankByAttraction(r.stable, new Map());
      expect(ranked.map((x) => x.molecule)).toEqual(r.stable);
    });
  });

  describe('declared root', () => {
    it('excludes a spanning phrase that is not the requested root', () => {
      const r = compose(T('shadows fall across the road'), pos);
      expect(r.stable.every((m) => m.type === 'S')).toBe(true);
      // The NP reading spans too, so filtering must actually remove something —
      // otherwise this passes for want of a rival rather than by excluding one.
      expect(r.stable.length).toBeLessThan(r.spanning.length);
      expect(r.spanning.some((m) => m.type !== 'S')).toBe(true);
    });

    it('still exposes every spanning molecule for a caller that wants them', () => {
      const r = compose(T('shadows fall across the road'), pos);
      expect(new Set(r.spanning.map((m) => m.type))).toContain('NP');
    });

    it('returns a bare noun phrase when NP is the declared root', () => {
      const r = compose(T('the dark wood'), pos, { roots: ['NP'] });
      expect(r.stable.length).toBeGreaterThan(0);
      expect(r.stable.every((m) => m.type === 'NP')).toBe(true);
    });

    it('abstains rather than guessing when the declared root does not span', () => {
      expect(compose(T('the dark wood'), pos).stable).toEqual([]);
    });
  });

  /**
   * TERMINAL PUNCTUATION IS NOT A PREDICATE. `S + PUNCT -> S` lets a clause
   * absorb its trailing `.` so sentences that end in punctuation can span at
   * all — but `parts[1]` of that S is the punctuation atom, not a verb
   * phrase. Before this fix `projectAnswer` read `headOf(parts[1])` blindly
   * and reported the full stop itself as the verb.
   */
  describe('terminal punctuation', () => {
    it('projects a sentence with a trailing period onto its real verb, not the period', () => {
      const [s] = spanningS(compose(T('stars burn .'), pos));
      expect(projectAnswer(s)).toEqual({ subject: 'stars', verb: 'burn' });
    });

    it('absorbs terminal punctuation on a transitive clause without changing the answer', () => {
      const [s] = spanningS(compose(T('the dog chased the cat .'), pos));
      expect(projectAnswer(s)).toEqual({ subject: 'dog', verb: 'chased' });
    });

    it('agrees with the punctuation-free projection of the same clause', () => {
      const bare = spanningS(compose(T('the dog chased the cat'), pos));
      const punctuated = spanningS(compose(T('the dog chased the cat .'), pos));
      expect(projectAnswer(punctuated[0])).toEqual(projectAnswer(bare[0]));
    });
  });

  /**
   * `headOf` looks a bond up by `(left, right, result)` and trusts the match
   * is unique. `validateBonds` is the enforcement of that trust — it is the
   * same loop the module runs on the real `BONDS` at load time, factored out
   * so a test can run it against a synthetic table and prove the duplicate
   * branch actually fires, rather than trusting the real table never
   * happening to hit it.
   */
  describe('validateBonds — the uniqueness headOf depends on', () => {
    it('accepts a table with no duplicate signatures', () => {
      expect(() => validateBonds([
        ['DET', 'N', 'NP', 1],
        ['ADJ', 'N', 'N', 1],
      ])).not.toThrow();
    });

    it('throws when two bonds share a (left, right, result) signature', () => {
      expect(() => validateBonds([
        ['DET', 'N', 'NP', 1],
        ['DET', 'N', 'NP', 0],
      ])).toThrow(/more than one entry/);
    });

    it('still throws on a bond missing a head index', () => {
      expect(() => validateBonds([['DET', 'N', 'NP']])).toThrow(/missing a head index/);
    });
  });

  /**
   * `headOf` used to fall back to `parts[0]` when no bond matched — silently
   * reproducing the exact positional-guessing bug this branch removed. It now
   * throws instead. A molecule whose `(left, right, result)` signature is not
   * in `BONDS` is not buildable by `compose`, so this can only be exercised
   * with a hand-built molecule, the same way the packed chart's equivalent
   * bug (Finding 2) could only be shown with a hand-built root.
   */
  describe('headOf — no bond found', () => {
    it('throws rather than silently guessing the left child', () => {
      const bogusChild = {
        type: 'NOT_A_REAL_RESULT',
        parts: [
          { type: 'ZZZ', parts: [], token: 'first' },
          { type: 'YYY', parts: [], token: 'second' },
        ],
        token: null,
      };
      const bogusRoot = {
        type: 'S',
        parts: [bogusChild, { type: 'VP', parts: [], token: 'verb' }],
        token: null,
      };
      expect(() => projectAnswer(bogusRoot)).toThrow(/no bond found/);
    });
  });
});
