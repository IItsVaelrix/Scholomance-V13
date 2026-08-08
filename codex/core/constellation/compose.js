/**
 * COMPOSE — atoms bond into molecules
 *
 * Every reading specialist so far proposes a FLAT claim about one token. Two of
 * them cannot join, so no arrangement of them can describe a clause inside a
 * noun phrase, which is the shape a garden path actually has. This module adds
 * the one missing operation: two adjacent structures with compatible types bond
 * into a larger structure.
 *
 * ─── STABILITY IS COVERAGE ────────────────────────────────────────────────
 *
 * A molecule is STABLE when it spans every token. This is what disqualifies the
 * main-clause reading of the garden path: `the horse raced past the barn` is a
 * perfectly well-formed S, and it leaves `fell` bonded to nothing. A reading
 * that strands a content word is not a worse reading, it is not a reading —
 * which is a veto in the arbiter's sense, not a low score.
 *
 * ─── BONDS CREATE, THE FIELD ONLY RANKS ───────────────────────────────────
 *
 * Typed compatibility is structural and lives here, pure and deterministic.
 * Nothing in this module consults corpus statistics, and nothing in it should:
 * a field that could FORM a bond the types forbid would put learned state in
 * the grammar. Ranking among stable molecules is a separate, later concern.
 *
 * PURE AND ZERO-I/O (PDR §18 Core law). POS is injected.
 *
 * @module codex/core/constellation/compose
 */

import {
  PREPOSITION_CUES, DETERMINERS, CONJUNCTIONS, RELATIVIZERS, SUBORDINATORS,
  PRONOUNS_NOMINATIVE, PRONOUNS_ACCUSATIVE, COPULAS, MODALS, AUXILIARY_VERBS,
  // Unions, used only for the "is this word known at all" test.
  PRONOUNS, AUXILIARIES, PARTICLES,
} from '../lexical-analysis/closed-class.js';
import { irregularPos } from '../lexical-analysis/irregular-forms.js';



/**
 * BINARY BOND TABLE — the typed compatibility that licenses joining.
 *
 * Deliberately tiny. The grammar is not the point of this experiment; whether
 * atoms bond at all is. Every rule here earns its place by being needed for a
 * phrase already under test.
 */
const BONDS = [
  ['DET', 'N', 'NP', 1],      // UD det: the noun is the head
  ['P', 'NP', 'PP', 1],       // UD case: the preposition is a dependent
  ['V', 'PP', 'VP', 0],
  ['NP', 'VP', 'S', 1],       // UD roots a clause on its verb
  /**
   * The same two atoms bond two ways. `raced` + `past the barn` is a finite verb
   * phrase OR a participial modifier, and nothing local distinguishes them —
   * this single ambiguous bond is the entire garden path. Chemistry has a word
   * for one set of atoms with two arrangements, and it is the right one here:
   * these are isomers, not a mistake to be resolved at bond time.
   */
  ['V', 'PP', 'PART', 0],
  ['NP', 'PART', 'NP', 0],
  ['V', 'NP', 'VP', 0],
  ['V', 'NPO', 'VP', 0],      // saw HIM
  ['P', 'NPO', 'PP', 1],      // UD case
  ['V', 'ADJ', 'VP', 0],
  /**
   * THE CATALAN GENERATOR. A prepositional phrase can modify what was done or
   * what it was done to, and nothing structural chooses between them. These two
   * rules are where parse counts start multiplying, and they are also
   * unavoidable — English genuinely permits both.
   */
  ['VP', 'PP', 'VP', 0],
  ['NP', 'PP', 'NP', 0],

  /* ── coverage rules ─────────────────────────────────────────────────── */
  ['ADJ', 'N', 'N', 1],       // the OLD MAN — stacks, so `the old grey man` works
                               // THE BUG: attributive adjective is amod, not the head
  ['ADV', 'ADJ', 'ADJ', 1],   // VERY OLD
  ['ADV', 'VP', 'VP', 1],     // QUICKLY RAN
  ['VP', 'ADV', 'VP', 0],     // RAN QUICKLY
  /**
   * Only a COPULA takes a predicate — `he is happy`, never `he will happy`.
   * Every auxiliary kind can take a verb phrase, which is what `AUX`/`MODAL`
   * license below.
   */
  ['COP', 'ADJ', 'VP', 1],    // IS TIRED — UD cop: `is tired` roots on tired
  ['COP', 'NP', 'VP', 1],     // IS A MAN — UD cop: `is a man` roots on man
  ['COP', 'VP', 'VP', 1],     // IS RUNNING — THE BUG
  ['AUX', 'VP', 'VP', 1],     // HAD GONE — THE BUG: `had gone` roots on gone
  ['MODAL', 'VP', 'VP', 1],   // CAN RUN — THE BUG: `can run` roots on run
  ['REL', 'VP', 'RELC', 1],   // WHO RAN
  ['NP', 'RELC', 'NP', 0],    // the man WHO RAN

  /**
   * Coordination is ternary (`X and Y`) and this table is binary, so the
   * conjunction first bonds rightward into a partial, which then bonds left.
   * Same shape for every category that coordinates.
   */
  ['CONJ', 'NP', 'CONJNP', 1], // UD cc: the conjunction is a dependent
  ['NP', 'CONJNP', 'NP', 0],   // UD conj attaches to the FIRST conjunct
  ['CONJ', 'VP', 'CONJVP', 1],
  ['VP', 'CONJVP', 'VP', 0],   // first conjunct
  ['CONJ', 'S', 'CONJS', 1],
  ['S', 'CONJS', 'S', 0],      // first conjunct
  /**
   * DISCOURSE-INITIAL COORDINATION. `And the Spirit of God moved upon the face
   * of the waters` joins a sentence that is not in the input, so the left
   * operand simply is not there. Measured as the single largest blocker: 148
   * sentences composed across their whole length and still failed for want of
   * this one bond.
   */
  ['CONJ', 'S', 'S', 1],     // sentence-initial `And ...`; the clause is the head

  /**
   * ── the four the failure set named ─────────────────────────────────────
   *
   * Chosen by measurement, not intuition: infinitives appeared in 10.9% of
   * rule-gap failures and 0.0% of successes. Negation, existentials and
   * wh-questions were equally common in both and are deliberately NOT here.
   */
  ['TO', 'VP', 'INF', 1],      // TO RUN — UD mark
  ['V', 'INF', 'VP', 0],       // wants TO RUN
  ['COP', 'INF', 'VP', 1],     // is TO BE done — UD cop
  ['NP', 'INF', 'NP', 0],      // a man TO SEE

  ['SUB', 'S', 'SBAR', 1],     // BECAUSE SHE CAME — UD mark
  ['S', 'SBAR', 'S', 0],       // he left BECAUSE SHE CAME — main clause is the head
  ['SBAR', 'S', 'S', 1],       // BECAUSE SHE CAME, he left — fronted subordinate clause; main clause is the head

  ['THAN', 'NP', 'THANP', 1],  // THAN THE BOY
  ['ADJ', 'THANP', 'ADJ', 0],  // older THAN THE BOY
  ['VP', 'THANP', 'VP', 0],    // ran faster THAN THE BOY

  /** A possessor modifies its noun exactly as an adjective does. */
  ['POSS', 'N', 'N', 1],       // THE MAN'S hat

  /**
   * A SPLIT clitic scopes over the whole possessor phrase, not the adjacent
   * noun: in `the old man 's hat` it is THE OLD MAN who owns it. This is why a
   * correct tokenizer separates it — glued to `man`, that reading is unsayable.
   *
   * RULING: neither bond below is settled by "head is the content word" alone —
   * both children are already phrases. `NP + POSS -> GEN` heads on the
   * possessor NP, because the possessor is who the phrase is about until the
   * possessed noun arrives. `GEN + N -> NP` then heads on the possessed noun,
   * per UD nmod:poss.
   */
  ['NP', 'POSS', 'GEN', 0],    // the old man + 'S — RULING: the possessor noun heads the possessor phrase
  ['GEN', 'N', 'NP', 1],       // (the old man 's) + HAT — UD nmod:poss: the POSSESSED noun is the head

  /**
   * ── COMMA CONSTRUCTIONS ────────────────────────────────────────────────
   *
   * Sourced from Link Grammar's own priorities: its hand-curated English
   * dictionary spends more mass on comma connectors (Xc/Xd, 1,522 uses) than on
   * objects (O, 327). The harness had been stripping commas entirely, which
   * deleted every construction below before the parser ever saw it.
   *
   * A comma binds RIGHTWARD into a partial first, because this table is binary
   * and every one of these patterns is ternary — the same shape coordination
   * already uses.
   */
  ['ADV', 'COMMA', 'FRONTED', 0],   // quickly , — the comma is punct
  ['SBAR', 'COMMA', 'FRONTED', 0],  // because she came ,
  ['PP', 'COMMA', 'FRONTED', 0],    // in the morning ,
  ['FRONTED', 'S', 'S', 1],         // ... , he left — main clause is the head

  ['NP', 'COMMA', 'NPCOMMA', 0],
  /**
   * RULING: UD appos attaches to the FIRST NP, not the appositive that follows
   * the comma.
   */
  ['NPCOMMA', 'NP', 'APPOS', 0],    // the dog , the old cat — RULING: UD appos attaches to the FIRST NP
  ['APPOS', 'COMMA', 'NP', 0],      // ... , (closing comma)
  /**
   * `the cat and the man` bonds into an NP before the comma ever sees it, so the
   * list form needs the plain NP on the right. Apposition and listing are
   * genuinely ambiguous here — `the dog , the cat` is both — and both survive.
   */
  ['NPCOMMA', 'NP', 'NP', 0],       // the dog , the cat and the man — first conjunct

  ['S', 'COMMA', 'SCOMMA', 0],
  /**
   * RULING: UD conj — first clause heads, though the result type matches the
   * RIGHT child. UD's convention beats endocentricity here, and that is the
   * point of declaring rather than inferring.
   */
  ['SCOMMA', 'S', 'S', 0],          // he ran , she fell — RULING: UD conj, first clause heads

  /**
   * TERMINAL PUNCTUATION. UD tokenizes sentence-final `.` `!` `?` `;` `:` as
   * their own token, separate from the word before them, so a clause must be
   * able to absorb it directly or nothing spans the input at all — the
   * measured top cause of parse failure (see PUNCT atom above). Deliberately
   * minimal: only a clause absorbs it, nothing else does yet.
   */
  ['S', 'PUNCT', 'S', 0],    // a clause absorbs its terminal punctuation

  /**
   * ── PARTICLES / PHRASAL VERBS ──────────────────────────────────────────
   *
   * The particle joins the VERB rather than forming a phrase of its own, which
   * is why the result is `V` and not `VP`: `gave up` is still a verb and still
   * takes `the ghost`. English also separates the pair around the object, so
   * both orders need a bond.
   */
  ['V', 'PRT', 'V', 0],      // GAVE UP (the ghost) — UD compound:prt
  ['VP', 'PRT', 'VP', 0],    // picked it UP

  /**
   * ── BARE FRONTING ──────────────────────────────────────────────────────
   *
   * English fronts adjuncts with no comma at all: `In his right hand he grasped
   * a long sword`. Measured as the dominant remaining blocker — the fronted
   * phrase parsed, the clause parsed, and nothing joined them because every
   * fronting rule above requires a COMMA.
   */
  ['PP', 'S', 'S', 1],
  ['ADV', 'S', 'S', 1],

  /**
   * ── COMPLEMENT CLAUSES AND INVERSION ───────────────────────────────────
   *
   * All three read off the blocker sample rather than guessed: `that` was the
   * 4th most common blocking token (24 sentences), `to` the 2nd (57), and
   * inversion appeared as `Shall we go` and `Why can not we call up Mr`.
   */

  /**
   * `that` as a COMPLEMENTIZER — `he answered THAT the name was new` embeds a
   * whole clause as the verb's object. Distinct from the relative use above
   * (`REL + VP -> RELC`), where the same word introduces a modifier instead.
   */
  ['REL', 'S', 'SBAR', 1],   // THAT the man ran
  ['V', 'SBAR', 'VP', 0],    // answered THAT ...
  ['COP', 'SBAR', 'VP', 1],  // is THAT ... — UD cop

  /** An infinitive completing an adjective: `likely TO BE true`. */
  ['ADJ', 'INF', 'ADJ', 0],

  /**
   * SUBJECT-AUX INVERSION. The auxiliary precedes its subject, so `NP + VP -> S`
   * cannot fire — the pieces are in the wrong order, not missing. The auxiliary
   * binds its subject first, and the result takes the predicate.
   *
   * RULING: INV bundles an auxiliary with the subject; the subject NP is the
   * content word, so it heads INV. INV is never itself a head in bonds 65-67.
   */
  ['MODAL', 'NP', 'INV', 1],   // SHALL WE ...
  ['AUX', 'NP', 'INV', 1],     // DID HE ...
  ['COP', 'NP', 'INV', 1],     // IS HE ...
  ['INV', 'VP', 'S', 1],       // ... go — main verb heads the clause
  ['INV', 'ADJ', 'S', 1],      // ... happy — UD cop: `is he happy` roots on happy
  ['INV', 'NP', 'S', 1],       // ... a doctor — UD cop

  /**
   * ── ADVERB PLACEMENT (EE / EF / EN / MVi) — MEASURED AND REJECTED ───────
   *
   * Link Grammar's `<ordinary-adv>` distinguishes adverb-modifying-adverb (EE),
   * post-adjective (EF), adverb-modifying-preposition (EN) and infinitival verb
   * modifiers (MVi). All four were added here and REMOVED after measurement:
   *
   *     baseline      27.2% coverage   21.89 mean parses   1,536 worst
   *     +MVi only     27.5%            29.15               5,088
   *     +all four     27.6%            37.78               5,088
   *
   * +0.4 points of coverage for +73% parses and a 3.3x worst case. The reason is
   * that every one of these constructions ALREADY spanned by flat attachment —
   * `he ran very quickly` bracketed as `(VP (VP (VP ran) very) quickly)`. The
   * rules buy correct NESTING, not reach, and no consumer reads the nesting:
   * `projectAnswer` takes subject and verb, which adverb bracketing never moves.
   *
   * `VP + INF -> VP` was the worst offender on its own, because `V + INF -> VP`
   * already exists and the two overlap — every infinitive could then attach at
   * two levels.
   *
   * Re-add only alongside a consumer that reads constituent structure.
   */
];

/**
 * EVERY BOND MUST DECLARE ITS HEAD. Not optional with a default.
 *
 * `headOf` used to find a head by position — leftmost, with one hand-carved
 * exception for determiners — and English puts the head on the right in several
 * constructions. Each one nobody tested was silently wrong: measured on UD
 * English-EWT, 46.4% of scoreable parses reported the auxiliary as the verb and
 * 5.6% reported the adjective as the subject.
 *
 * A default of 0 would reproduce exactly that failure, because the bonds nobody
 * reviewed would keep the old behaviour. Throwing here means an unreviewed bond
 * cannot run.
 */
for (const bond of BONDS) {
  if (bond.length !== 4 || (bond[3] !== 0 && bond[3] !== 1)) {
    throw new Error(`BONDS entry missing a head index: ${JSON.stringify(bond)}`);
  }
}

/** Unary lifts: a bare token standing in for a phrase. */
/**
 * Unary lifts: a bare token standing in for a phrase.
 *
 * `PRONACC` lifts to NPO, not NP — an object noun phrase. Only NP can be a
 * subject, which is what stops `him ran` while leaving `the man saw him` intact.
 */
const LIFTS = [
  ['N', 'NP'], ['V', 'VP'], ['PRON', 'NP'], ['PROPN', 'NP'], ['PRONACC', 'NPO'],
  /**
   * THE IMPERATIVE. `speak`, `tell me all about it` — a clause with no subject,
   * so `NP + VP -> S` can never fire and the input could not span. Common enough
   * in narrative dialogue to have blocked a visible share of the corpus.
   */
  ['VP', 'S'],
];

/**
 * SUFFIX BACKOFF — category from morphology when the lexicon has no entry.
 *
 * Measured: 11.4% of real tokens are absent from `lemma_form`, and that absence
 * blocked 66.9% of parse failures. A word the table has never seen still
 * declares its category in its ending, because English derivation is
 * rule-governed and orthographic.
 *
 * ORTHOGRAPHIC, NOT PHONEMIC, and deliberately so. `knight` and `night` are
 * indistinguishable by sound — `phonotopography.js` documents their vectors as
 * identical — yet trivially distinguishable by spelling. Morphology survives in
 * the letters after it has been erased from the pronunciation.
 *
 * Longest match wins, and a suffix that genuinely spans two categories returns
 * both rather than inventing a distinction the ending does not make.
 *
 * @param {string} token lowercased surface form
 * @returns {string[]} POS letters, or [] when nothing is recognised
 */
export function guessPos(token) {
  const w = String(token || '');
  if (w.length < 4) return [];
  const SUFFIXES = [
    ['ousness', ['n']], ['fulness', ['n']], ['iveness', ['n']],
    ['ation', ['n']], ['ition', ['n']], ['ution', ['n']], ['ology', ['n']],
    ['ment', ['n']], ['ness', ['n']], ['ship', ['n']], ['hood', ['n']],
    ['dom', ['n']], ['ism', ['n']], ['ist', ['n']], ['ity', ['n']],
    ['tion', ['n']], ['sion', ['n']], ['ance', ['n']], ['ence', ['n']],
    ['age', ['n']], ['ery', ['n']],
    ['ify', ['v']], ['ize', ['v']], ['ise', ['v']], ['ate', ['v']],
    ['ously', ['r']], ['ally', ['r']], ['ly', ['r']],
    ['able', ['a']], ['ible', ['a']], ['ous', ['a']], ['ful', ['a']],
    ['less', ['a']], ['ive', ['a']], ['ish', ['a']], ['ary', ['a']],
    ['ic', ['a']], ['al', ['a']],
    /**
     * Inflection. `-ed` and `-ing` are both verbal and adjectival — `the tired
     * man`, `a running stream` — and the participial reading is exactly what the
     * reduced-relative bond consumes, so collapsing it would remove the garden
     * path from every unknown word.
     */
    ['ing', ['v', 'a']], ['ed', ['v', 'a']],
    ['est', ['a']],
  ];
  for (const [suffix, tags] of SUFFIXES) {
    if (w.length > suffix.length && w.endsWith(suffix)) return [...tags];
  }
  return [];
}

/**
 * Lexical typing from the injected POS table. A token can carry several types —
 * `fell` is a noun AND a verb — and each becomes its own atom, because the
 * ambiguity is real and resolving it here would be guessing.
 */
function atomsFor(token, index, posMap) {
  const lower = String(token).toLowerCase();
  /**
   * PRECEDENCE: injected lexicon, then irregular forms, then suffix morphology.
   *
   * Irregulars come before suffixes because they have no suffix to read — that
   * is what makes them irregular. `came` is a verb and nothing in its spelling
   * says so. The lexicon still outranks both, so `wound` stays the noun it
   * knows rather than becoming the past tense of `wind`.
   */
  const known = posMap.get(lower);
  let tags = known && known.length > 0 ? known : [];
  if (tags.length === 0) tags = irregularPos(lower);
  if (tags.length === 0) tags = guessPos(lower);
  const out = [];

  /**
   * CAPITALISATION IS EVIDENCE ONLY AWAY FROM THE SENTENCE EDGE. Every English
   * sentence capitalises its first word, so position 0 says nothing about the
   * word — reading it as a name would type half of all prose as people. At
   * position 0 the signal is admitted only when the lexicon has never heard of
   * the word, where no common-noun reading is being displaced.
   */
  const capitalised = /^[A-Z]/.test(String(token));
  const isClosedClass = DETERMINERS.has(lower) || PRONOUNS.has(lower)
    || AUXILIARIES.has(lower) || CONJUNCTIONS.has(lower)
    || RELATIVIZERS.has(lower) || PREPOSITION_CUES.has(lower);
  // A closed-class word is never unknown, even when the content lexicon —
  // which stores nouns, verbs and adjectives — has no row for it.
  if (capitalised && (index > 0 || (!known && !isClosedClass))) out.push('PROPN');

  if (DETERMINERS.has(lower)) out.push('DET');
  if (PREPOSITION_CUES.has(lower)) out.push('P');
  if (tags.includes('n')) out.push('N');
  if (tags.includes('v')) out.push('V');
  if (tags.includes('a') || tags.includes('s')) out.push('ADJ');
  if (tags.includes('r')) out.push('ADV');
  // Case and auxiliary subtype are the features that decide behaviour, so they
  // are what the atom carries — membership alone let `him ran` compose.
  if (PRONOUNS_NOMINATIVE.has(lower)) out.push('PRON');
  if (PRONOUNS_ACCUSATIVE.has(lower)) out.push('PRONACC');
  if (COPULAS.has(lower)) out.push('COP');
  if (MODALS.has(lower)) out.push('MODAL');
  if (AUXILIARY_VERBS.has(lower)) out.push('AUX');
  if (CONJUNCTIONS.has(lower)) out.push('CONJ');
  if (RELATIVIZERS.has(lower)) out.push('REL');
  if (SUBORDINATORS.has(lower)) out.push('SUB');
  if (lower === 'to') out.push('TO');
  if (lower === 'than') out.push('THAN');
  if (lower === ',') out.push('COMMA');
  /**
   * TERMINAL PUNCTUATION. UD tokenizes `.` `!` `?` `;` `:` as their own token,
   * separate from the word before them — so a clause that spans everything up
   * to but not including the final period has nothing left to absorb it into.
   * Measured as the single largest cause of parse failure across 2,001 gold
   * EWT sentences (918 `PUNCT -> VERB` failures alone). Kept distinct from
   * COMMA, which has its own constructions (fronting, apposition, clause
   * coordination) built on it above.
   */
  if (lower === '.' || lower === '!' || lower === '?' || lower === ';' || lower === ':') out.push('PUNCT');
  if (PARTICLES.has(lower)) out.push('PRT');
  // The clitic either arrives glued (`man's`) or split off by the tokenizer
  // (`'s`); both are possessive, and the split form is also the copula in
  // `that's better`, so it carries AUX too rather than forcing a choice.
  if (lower === "'s") { out.push('POSS'); out.push('AUX'); }
  else if (/'s$/.test(lower) && lower.length > 2) out.push('POSS');
  return out.map((type) => ({ type, from: index, to: index, parts: [], token }));
}

/**
 * The head of a molecule, read from the bond that built it.
 *
 * This used to guess by position — leftmost child, with one hand-carved
 * exception for `DET`. English puts the head on the right in several
 * constructions and each untested one was silently wrong. The exception is gone
 * because `['DET', 'N', 'NP', 1]` now says the same thing as data.
 */
function headOf(m) {
  if (m.parts.length === 0) return m.token;
  if (m.parts.length === 1) return headOf(m.parts[0]);
  // `(left, right, result)` is unique across the table — verified 2026-08-08,
  // no duplicate signatures — so this find is unambiguous.
  const bond = BONDS.find(
    (b) => b[0] === m.parts[0].type && b[1] === m.parts[1].type && b[2] === m.type,
  );
  // A molecule whose bond cannot be found is a chart the grammar did not build.
  // Falling back to the left child keeps this total rather than throwing inside
  // a projection, and the head-declaration test proves the table is complete.
  return headOf(bond ? m.parts[bond[3]] : m.parts[0]);
}

/**
 * PROJECT a parse onto the answer a consumer asked for.
 *
 * Parse count is a property of structure; ambiguity is a property of ANSWERS.
 * Two parses that differ only in where a modifier attaches project to the same
 * pair, so counting parses over-reports ambiguity for any consumer that does not
 * ask about attachment. Consumers that DO ask about attachment — `governor.js`
 * resolving which noun an adjective is predicated of — must not use this
 * projection, because for them the difference is the whole answer.
 *
 * @param {object} molecule a molecule of type 'S'
 * @returns {{subject: string, verb: string}}
 */
export function projectAnswer(molecule) {
  if (!molecule || molecule.type !== 'S') return { subject: null, verb: null };
  /**
   * An IMPERATIVE has one child, not two — `speak`, `tell me all about it`. The
   * subject is genuinely absent, so it projects as null. Supplying the implied
   * `you` would put a token in the answer that the parse never saw.
   */
  const [first, second] = molecule.parts;
  if (!second) return { subject: null, verb: headOf(first) };
  /**
   * TERMINAL PUNCTUATION IS NOT A PREDICATE. `S + PUNCT -> S` lets a clause
   * absorb its trailing `. ! ? ; :` so the whole sentence can span, because UD
   * tokenizes that mark separately from the word before it — but `parts[1]`
   * here is the punctuation atom, not a verb phrase, and reading `headOf` off
   * it answers `.`. Every sentence that only newly parses because of this bond
   * would otherwise report its full stop as the verb. Look through it instead:
   * the answer is whatever `parts[0]` — the clause that did the absorbing —
   * already projects to, and the punctuation contributes nothing of its own.
   */
  if (second.type === 'PUNCT') return projectAnswer(first);
  return { subject: headOf(first), verb: headOf(second) };
}

/**
 * Which lexical POS a chart category is a reading of. Closed-class categories
 * are absent on purpose: no one has a sense count for `the`, and inventing a
 * neutral one would let function words sway a score they know nothing about.
 */
const CATEGORY_POS = new Map([
  ['N', 'n'], ['V', 'v'], ['ADJ', 'a'], ['ADV', 'r'],
]);

/** Every leaf atom under a molecule, in surface order. */
function leavesOf(molecule, out = []) {
  if (molecule.parts.length === 0) { out.push(molecule); return out; }
  for (const part of molecule.parts) leavesOf(part, out);
  return out;
}

/**
 * ATTRACTION RANKING — how strongly each token attracts the category this parse
 * assigned it.
 *
 * A word with eleven noun senses and two verb senses attracts `n` far harder
 * than `v`, so a parse that reads `man` as a verb is paying for it. Weight is
 * the token's sense count for the assigned POS over its best POS, so the
 * dominant reading scores 1.0 and a rare one scores low.
 *
 * ─── IT RANKS, IT DOES NOT FILTER ─────────────────────────────────────────
 *
 * Measured before building: pruning atoms by this same signal traded coverage
 * for precision on a curve with no free point — 2x pruning halved worst-case
 * parses (932 -> 496) and cost 5.2 points of coverage, while gentle settings
 * bought almost nothing. Ranking keeps every legal parse, so coverage is
 * untouched and the decision stays with the caller.
 *
 * That is also the law this module already states: bonds create, the field only
 * ranks. A weight able to REMOVE a structure would be learned state acting as
 * grammar.
 *
 * SCORES COMBINE GEOMETRICALLY, so one absurd reading sinks a parse rather than
 * being averaged away by its well-behaved neighbours, and the result stays
 * comparable across molecules of different sizes.
 *
 * ABSENT SENSE DATA IS ABSTENTION. A token with no counts contributes nothing
 * rather than a zero — the same discipline as `null` never being a small number.
 *
 * @param {object[]} molecules
 * @param {Map<string, {n?: number, v?: number, a?: number, r?: number}>} senseMap
 *   injected lexicon data — per-POS sense counts. Nothing here is learned.
 * @returns {Array<{molecule: object, score: number}>} every input molecule,
 *   ordered by descending score. Ties keep their original order.
 */
export function rankByAttraction(molecules, senseMap) {
  const scored = (molecules || []).map((molecule, index) => {
    let logSum = 0;
    let counted = 0;
    for (const leaf of leavesOf(molecule)) {
      const wanted = CATEGORY_POS.get(leaf.type);
      if (!wanted) continue;
      const counts = senseMap && senseMap.get(String(leaf.token).toLowerCase());
      if (!counts) continue;
      const best = Math.max(...Object.values(counts));
      if (!(best > 0)) continue;
      const mine = counts[wanted] || 0;
      // A category the lexicon never records for this token is maximally
      // unattracted, but must not be log(0).
      logSum += Math.log(Math.max(mine, 0.5) / best);
      counted += 1;
    }
    const score = counted === 0 ? 1 : Math.exp(logSum / counted);
    return { molecule, score, index };
  });
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  return scored.map(({ molecule, score }) => ({ molecule, score }));
}

/**
 * Close a chart cell under the unary lifts, to a fixed point.
 *
 * A lift can feed another lift, so this repeats until nothing new appears. The
 * identity guard keys on the exact parent molecule, which is what stops a cycle
 * from growing the cell forever.
 */
function closeUnderLifts(bucket, from, to) {
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of [...bucket]) {
      for (const [src, dst] of LIFTS) {
        if (m.type !== src) continue;
        if (bucket.some((x) => x.type === dst && x.parts[0] === m)) continue;
        bucket.push({ type: dst, from, to, parts: [m], token: m.token });
        grew = true;
      }
    }
  }
}

/**
 * Bottom-up composition over spans. Bounded and deterministic: every molecule
 * is derived from strictly shorter ones, so the fixed point is reached in a
 * single upward pass over span widths.
 *
 * ─── THE ROOT IS DECLARED, NOT GUESSED ────────────────────────────────────
 *
 * Spanning the input is necessary but not sufficient. `shadows fall across the
 * road` spans as an S (the shadows fall) and ALSO as an NP (shadows fallen
 * across the road). Reporting both as stable told a caller asking for a clause
 * that its clause was ambiguous, when the rival was not a clause at all.
 *
 * So the caller declares what it asked for — the same discipline the cue
 * arbiter uses for jurisdiction. ConstellationOS queries a bare noun phrase as
 * often as a sentence, which is precisely why no single root can be assumed
 * globally, and why this is an argument rather than a constant.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {{roots?: string[]}} [options] acceptable root types; defaults to a
 *   complete clause. `spanning` comes back unfiltered either way, so a caller
 *   wanting a different root can inspect the chart instead of re-parsing.
 * @returns {{ atoms: object[], molecules: object[], spanning: object[],
 *   stable: object[] }}
 */
export function compose(tokens, posMap, options = {}) {
  const roots = options.roots || ['S'];
  const n = (tokens || []).length;
  if (n === 0 || !posMap) {
    return { atoms: [], molecules: [], spanning: [], stable: [] };
  }

  /** cell[from][to] = molecules covering exactly that span */
  const cell = Array.from({ length: n }, () => Array.from({ length: n }, () => []));
  const atoms = [];

  for (let i = 0; i < n; i += 1) {
    for (const a of atomsFor(tokens[i], i, posMap)) {
      atoms.push(a);
      cell[i][i].push(a);
    }
    closeUnderLifts(cell[i][i], i, i);
  }

  for (let width = 2; width <= n; width += 1) {
    for (let from = 0; from + width - 1 < n; from += 1) {
      const to = from + width - 1;
      for (let split = from; split < to; split += 1) {
        for (const left of cell[from][split]) {
          for (const right of cell[split + 1][to]) {
            for (const [l, r, result] of BONDS) {
              if (left.type !== l || right.type !== r) continue;
              cell[from][to].push({ type: result, from, to, parts: [left, right] });
            }
          }
        }
      }
      /**
       * Unary closure belongs at EVERY span, not only at single tokens.
       * `ADJ + N -> N` builds a multi-token nominal that still needs lifting to
       * NP, and omitting this made `old men fell` unparseable while
       * `the old man fell` worked — `DET + N -> NP` reached NP directly and hid
       * the gap behind every determiner in the corpus.
       */
      closeUnderLifts(cell[from][to], from, to);
    }
  }

  const molecules = cell.flat().flat();
  // Spanning the input is the structural requirement — nothing that strands a
  // token appears here, so coverage is a property of the chart rather than a
  // check anyone has to remember to run.
  const spanning = cell[0][n - 1];
  // Stability adds the caller's declared root to that structural test.
  const stable = spanning.filter((m) => roots.includes(m.type));

  return { atoms, molecules, spanning, stable };
}

/**
 * EXPOSED FOR `compose-packed.js`, which reuses this grammar and this atom
 * typing verbatim rather than copying them.
 *
 * A second copy of `atomsFor` would be a second place for the capitalisation
 * rule and the lexicon/irregular/suffix precedence to drift, and the two
 * parsers must be comparable atom-for-atom or the equivalence harness proves
 * nothing about the chart.
 *
 * This is an export-only addition. No logic in this file changes.
 */
export { BONDS, LIFTS, atomsFor };
