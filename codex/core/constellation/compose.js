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
  INTERROGATIVE_ADVERBS,
  // Unions, used only for the "is this word known at all" test.
  PRONOUNS, AUXILIARIES, PARTICLES,
} from '../lexical-analysis/closed-class.js';
import { irregularPos } from '../lexical-analysis/irregular-forms.js';
/**
 * BINARY BOND TABLE — projected from the Construction Registry (Grimoire).
 *
 * The chart still consumes dumb 4-tuples `[left, right, result, head]`.
 * What those bonds *mean* about grammar lives in `./grimoire/` — status
 * (grammar | scaffold | approximation | deprecated), family, relation, and
 * limitations. BONDS are the spells; the Grimoire is the book.
 *
 * @see codex/core/constellation/grimoire/index.js
 */
import { BONDS } from './grimoire/index.js';

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
 *
 * A declared head is only unambiguous if `(left, right, result)` names at
 * most one bond — `headOf` looks a bond up by that triple and trusts there is
 * only one match. That uniqueness holds today (68 bonds, 68 distinct
 * signatures) but nothing enforced it before this loop; a second bond
 * quietly reusing a signature would make `headOf` read whichever one
 * `BONDS.find` happened to see first, and nothing here would say so. This
 * loop now checks BOTH properties this module depends on: every bond
 * declares a head, and no two bonds share a signature.
 *
 * Factored into a function, rather than inlined as a bare loop, so a test can
 * run the same check against a synthetic bond list and prove the duplicate
 * branch actually fires — the real `BONDS` table only has one chance to
 * exercise it (module load), and that chance is spent proving BONDS is
 * clean, not proving the check works.
 *
 * @param {Array<[string, string, string, 0|1]>} bonds
 */
export function validateBonds(bonds) {
  const seenSignatures = new Set();
  for (const bond of bonds) {
    if (bond.length !== 4 || (bond[3] !== 0 && bond[3] !== 1)) {
      throw new Error(`BONDS entry missing a head index: ${JSON.stringify(bond)}`);
    }
    const signature = `${bond[0]}|${bond[1]}|${bond[2]}`;
    if (seenSignatures.has(signature)) {
      throw new Error(`BONDS has more than one entry for ${signature} — headOf's lookup would be ambiguous`);
    }
    seenSignatures.add(signature);
  }
}
validateBonds(BONDS);

/** Unary lifts: a bare token standing in for a phrase. */
/**
 * Unary lifts: a bare token standing in for a phrase.
 *
 * `PRONACC` lifts to NPO, not NP — an object noun phrase. Only NP can be a
 * subject, which is what stops `him ran` while leaving `the man saw him` intact.
 */
const LIFTS = [
  ['N', 'NP'], ['NC', 'N'], ['V', 'VP'], ['PRON', 'NP'], ['PROPN', 'NP'], ['PRONACC', 'NPO'],
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
 * The identities a lexicon, the irregulars, and morphology can name for one form.
 * The precedence is the one `atomsFor` documents; this is it, factored out so a
 * compound can ask the same question of each of its pieces.
 */
function tagsForForm(lower, posMap) {
  const known = posMap.get(lower);
  let tags = known && known.length > 0 ? known : [];
  if (tags.length === 0) tags = irregularPos(lower);
  if (tags.length === 0) tags = guessPos(lower);
  return tags;
}

/** A hyphen with word material on both sides — `peach-tree`, not `--` or `-30`. */
const HYPHEN_COMPOUND = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/**
 * COMPOUND IDENTITY IS THE UNION OF ITS PIECES.
 *
 * The constellation query path splits on whitespace, so a hyphen-declared
 * compound arrives as ONE token — and `lemma_form` has no row for `peach-tree`,
 * no irregular names it, and no suffix ends it. It therefore received no lexical
 * atom at all, could bond with nothing, and took the whole phrase down with it:
 * `the peach-tree fell` produced zero stable molecules while `the peach tree
 * fell` parsed.
 *
 * UNION, not the head piece alone. Measured 2026-08-11 on 342 compound-bearing
 * Gutenberg phrases: fusing with the head piece's identity scored 55.6% with 9
 * regressions, fusing with the union scored 59.9% with 2, against 46.8% for the
 * split arm. A single inherited identity is the constraint, not the bond.
 *
 * The lexicon still outranks this: a hyphenated form the table knows keeps its
 * own row, and the pieces are consulted only when nothing names the whole.
 */
function compoundTags(lower, posMap) {
  if (!HYPHEN_COMPOUND.test(lower)) return [];
  const union = [];
  for (const piece of lower.split('-')) {
    for (const tag of tagsForForm(piece, posMap)) {
      if (!union.includes(tag)) union.push(tag);
    }
  }
  return union;
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
  let tags = tagsForForm(lower, posMap);
  if (tags.length === 0) tags = compoundTags(lower, posMap);
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
    || RELATIVIZERS.has(lower) || PREPOSITION_CUES.has(lower)
    || INTERROGATIVE_ADVERBS.has(lower);
  // A closed-class word is never unknown, even when the content lexicon —
  // which stores nouns, verbs and adjectives — has no row for it.
  //
  // `!known?.length`, NOT `!known`. The convention here — in `goldPosMap` and in
  // `constellationPage.service.js` — is that a word the lexicon has no tags for
  // maps to an EMPTY ARRAY, and `[]` is truthy. Written as `!known`, the
  // unknown-word escape hatch could not fire for any caller that follows the
  // convention, and every capitalised proper noun at index 0 lost its PROPN
  // atom. Line 176 above already asks the question the right way.
  if (capitalised && (index > 0 || (!known?.length && !isClosedClass))) out.push('PROPN');

  if (DETERMINERS.has(lower)) out.push('DET');
  if (PREPOSITION_CUES.has(lower)) out.push('P');
  /**
   * CLOSED-CLASS WORDS ARE NOT CONTENT NOUNS. Construction autopsy of N+N found
   * ~48% "juxtaposition-orphan" firings on mistyped N (e.g. `a`+`car`, `courts`+`in`).
   * Function membership outranks lemma_form `n` so compound chemistry only sees
   * real content nouns.
   */
  const closedForContent = DETERMINERS.has(lower)
    || PREPOSITION_CUES.has(lower)
    || CONJUNCTIONS.has(lower)
    || RELATIVIZERS.has(lower)
    || SUBORDINATORS.has(lower)
    || COPULAS.has(lower)
    || MODALS.has(lower)
    || AUXILIARY_VERBS.has(lower)
    || PRONOUNS.has(lower)
    || lower === 'to'
    || lower === 'than';
  /**
   * Pure nouns → NC only (lift NC→N→NP). Dual n+v → N only (subjects/objects
   * without entering compound chemistry). That split stops barn+fell and avoids
   * doubling every noun as both N and NC (which exploded stable counts).
   */
  if (tags.includes('n') && !closedForContent) {
    if (tags.includes('v')) out.push('N');
    else out.push('NC');
  }
  if (tags.includes('v') && !closedForContent) out.push('V');
  if ((tags.includes('a') || tags.includes('s')) && !closedForContent) out.push('ADJ');
  if (tags.includes('r') && !closedForContent) out.push('ADV');
  // Case and auxiliary subtype are the features that decide behaviour, so they
  // are what the atom carries — membership alone let `him ran` compose.
  if (PRONOUNS_NOMINATIVE.has(lower)) out.push('PRON');
  if (PRONOUNS_ACCUSATIVE.has(lower)) out.push('PRONACC');
  /**
   * BE-FORMS ARE BOTH COP AND AUX. UD: *be* is cop with a nonverbal predicate
   * (`is tired`) and aux with a lexical verb (`is running`, `was arrested`).
   * Emitting both atoms lets COP+ADJ/NP and AUX+VP select the right theory;
   * the deprecated COP+VP bond is no longer projected into BONDS.
   */
  if (COPULAS.has(lower)) {
    out.push('COP');
    out.push('AUX');
  }
  if (MODALS.has(lower)) out.push('MODAL');
  if (AUXILIARY_VERBS.has(lower)) out.push('AUX');
  if (CONJUNCTIONS.has(lower)) out.push('CONJ');
  if (RELATIVIZERS.has(lower)) out.push('REL');
  if (SUBORDINATORS.has(lower)) out.push('SUB');
  if (INTERROGATIVE_ADVERBS.has(lower)) out.push('ADV');
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
   *
   * CLOSURE 2026-08-08: also accept REPEATED terminal marks as one PUNCT atom
   * (`!!`, `...`, `???`). Root-closure autopsy found S already built with only
   * multi-char punct fringe, and single-char equality left those atoms untyped
   * so S+PUNCT could never fire. Still not COMMA.
   */
  if (/^[.!?…;:]+$/.test(lower)) out.push('PUNCT');
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
  // `(left, right, result)` is unique across the table — the validation loop
  // above throws at module load if two bonds ever share a signature — so this
  // find is unambiguous whenever it succeeds.
  const bond = BONDS.find(
    (b) => b[0] === m.parts[0].type && b[1] === m.parts[1].type && b[2] === m.type,
  );
  // A molecule whose bond cannot be found is a chart the grammar did not
  // build — every molecule this module constructs is built by walking BONDS,
  // so this can only mean the caller handed in a molecule from somewhere
  // else, or a corrupted one. Silently falling back to the left child
  // reproduces the exact positional-guessing bug this branch removed
  // (`headOf` used to guess `parts[0]` for everything); throwing keeps that
  // bug from coming back through the one path nobody was watching.
  if (!bond) {
    throw new Error(
      `headOf: no bond found for ${m.parts[0].type} + ${m.parts[1].type} -> ${m.type}`,
    );
  }
  return headOf(m.parts[bond[3]]);
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
  /**
   * MATRIX-PRESERVING ADJUNCTION. Fronted ADV/PP/ADJ/FRONTED/CONJ + S declare
   * head on the matrix. Positional [subj, pred] would report the adjunct head
   * as subject (`old men ran` → subject "old"). When the head child is S,
   * re-project from that matrix — same spirit as PUNCT absorb.
   */
  const bond = BONDS.find(
    (b) => b[0] === first.type && b[1] === second.type && b[2] === 'S',
  );
  if (bond) {
    if (bond[3] === 1 && second.type === 'S') return projectAnswer(second);
    if (bond[3] === 0 && first.type === 'S') return projectAnswer(first);
  }
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
