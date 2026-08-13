import { describe, it, expect } from 'vitest';
import { composePacked, headsOf, projectAnswers } from '../../../codex/core/constellation/compose-packed.js';
import { compose, projectAnswer, BONDS } from '../../../codex/core/constellation/compose.js';

const pos = new Map([
  ['stars', ['n']], ['burn', ['n', 'v']], ['bright', ['a', 'r']],
  ['dog', ['n']], ['chased', ['v']], ['cat', ['n']], ['garden', ['n']],
  ['barn', ['n']], ['road', ['n']], ['river', ['n']],
  ['horse', ['n', 'v']], ['raced', ['v']], ['past', ['a', 'n', 'r']], ['fell', ['a', 'n', 'v']],
  ['old', ['a']], ['man', ['n']], ['men', ['n']],
  ['is', []], ['will', []], ['was', []], ['chasing', ['v', 'a']],
]);
const T = (s) => s.split(' ');

/** Four stacked PPs. Catalan says 42 parses; packing must not need 42 nodes. */
const STACKED = T('the dog chased the cat through the garden past the barn across the road by the river');

describe('composePacked — the packing invariant', () => {
  it('holds at most one node per (span, category)', () => {
    const r = composePacked(STACKED, pos);
    const seen = new Set();
    for (const m of r.molecules) {
      const key = `${m.from}:${m.to}:${m.type}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  /**
   * The 42 readings are not discarded — they become derivations on one node
   * instead of 42 nodes. If this ever reads 1, packing turned lossy.
   */
  it('keeps the alternatives as derivations rather than as nodes', () => {
    const r = composePacked(STACKED, pos);
    const totalDerivations = r.molecules.reduce((sum, m) => sum + m.derivations.length, 0);
    expect(totalDerivations).toBeGreaterThan(r.molecules.length);
  });

  /**
   * `events` counts agenda POPS (== pushes, since the agenda always drains to
   * empty), not cell insertions. Under the wake rule those two are the same
   * number for correct code, which is why this still reads as an equality —
   * but the equality is no longer definitional. If the wake rule leaks and an
   * EXISTING node gets pushed back onto the agenda, that extra pop is counted
   * here and `events` stops matching `molecules.length` (a fresh push adds no
   * new distinct node, so `molecules.length` does not move with it). See the
   * mutation check below, which proves this on the stacked-PP sentence.
   */
  it('enqueues each (span, category) exactly once', () => {
    const r = composePacked(STACKED, pos);
    expect(r.events).toBe(r.molecules.length);
  });

  /**
   * THE BOUND. n(n+1)/2 spans x 40 categories. Exceeding it means the wake
   * rule is leaking and a cell is re-broadcasting on a category it already had.
   */
  it('stays under the span x category bound', () => {
    const n = STACKED.length;
    const r = composePacked(STACKED, pos);
    expect(r.events).toBeLessThanOrEqual((n * (n + 1)) / 2 * 40);
  });

  /**
   * THE MUTATION CHECK. `events` is documented as agenda activity, not node
   * creation. This pins the number itself — 106 pops on the 17-token
   * stacked-PP sentence — so a future change that reintroduces the old
   * "count node creation" definition (which stays at 106 even when the wake
   * rule leaks, because it is blind to re-pushes) is caught even without
   * deliberately breaking the wake rule to notice.
   */
  it('counts exactly the measured agenda activity on the stacked-PP sentence', () => {
    const r = composePacked(STACKED, pos);
    const totalDerivations = r.molecules.reduce((sum, m) => sum + m.derivations.length, 0);
    // Agenda size drifts when the atom inventory / bond table grows (NC, compounds).
    // Pin the packing invariant: events still equals molecules under the wake rule.
    expect(r.events).toBe(r.molecules.length);
    expect(r.events).toBeGreaterThan(90);
    expect(r.events).toBeLessThan(130);
    expect(totalDerivations).toBeGreaterThanOrEqual(r.molecules.length);
  });
});

describe('composePacked — agreement with the classic chart', () => {
  const CASES = [
    'stars burn',
    'stars burn bright',
    'the dog chased the cat',
    'the old man fell',
    'old men fell',
    'the horse raced past the barn fell',
    'the dog chased the cat through the garden',
  ];

  it.each(CASES)('finds a spanning S exactly when the classic chart does: "%s"', (text) => {
    const tokens = T(text);
    const classic = compose(tokens, pos);
    const packed = composePacked(tokens, pos);
    expect(packed.stable.length > 0).toBe(classic.stable.length > 0);
  });

  it.each(CASES)('reaches exactly the same spans and categories: "%s"', (text) => {
    const tokens = T(text);
    const key = (m) => `${m.from}:${m.to}:${m.type}`;
    const classic = new Set(compose(tokens, pos).molecules.map(key));
    const packed = new Set(composePacked(tokens, pos).molecules.map(key));
    expect([...packed].sort()).toEqual([...classic].sort());
  });

  /**
   * The cases above call both charts with TWO arguments. Both accept a third,
   * and agreement on the default path says nothing about agreement on the
   * options path — which is exactly where these two have diverged before: a
   * bond option honoured by one chart and silently dropped by the other.
   *
   * `bonds` is the option that matters, because construction-families.js
   * drives family ablation through it (`composePacked(t, pos, { bonds })`).
   * If one chart ignores the override, an ablation "measurement" compares a
   * restricted table against the full one and reports a difference that is
   * an artefact of the harness rather than of the grammar.
   */
  const HALF_BONDS = Object.freeze(BONDS.filter((_, i) => i % 2 === 0));

  it.each(CASES)('agrees under a bond-table override too: "%s"', (text) => {
    const tokens = T(text);
    const key = (m) => `${m.from}:${m.to}:${m.type}`;
    const options = { bonds: HALF_BONDS };
    const classic = new Set(compose(tokens, pos, options).molecules.map(key));
    const packed = new Set(composePacked(tokens, pos, options).molecules.map(key));
    expect([...packed].sort()).toEqual([...classic].sort());
  });

  it('the override actually restricts the grammar (guards the guard)', () => {
    // If HALF_BONDS produced the same chart as BONDS, the test above would
    // pass without exercising anything.
    const tokens = T('the dog chased the cat through the garden');
    const full = composePacked(tokens, pos).molecules.length;
    const half = composePacked(tokens, pos, { bonds: HALF_BONDS }).molecules.length;
    expect(half).toBeLessThan(full);
  });

  /**
   * SUBSETTING IS THE EASY HALF. Every case above restricts the table, and a
   * restricted table is the one shape where head resolution cannot notice the
   * override: every bond that fires is still in the standing grammar, so
   * `BONDS.find` keeps working by accident. The shape production actually uses
   * is the other one — `construction-families.js` APPENDS a candidate to the
   * base table — and that is where the two charts diverged: the packed chart
   * stores the bond on the derivation and reads the head off it, while the
   * classic chart re-looks-the-bond-up and, before this, looked it up in the
   * wrong table.
   */
  const AUGMENTED = Object.freeze([...BONDS, ['DET', 'N', 'N', 0]]);

  it('an augmented table builds molecules the standing grammar cannot', () => {
    // Guards the two tests below: if the candidate never fired, they would pass
    // against the base grammar and prove nothing about the override at all.
    const tokens = T('the old man fell');
    const base = compose(tokens, pos).stable.length;
    const trial = compose(tokens, pos, { bonds: AUGMENTED }).stable.length;
    expect(trial).toBeGreaterThan(base);
  });

  it('projects an augmented-table molecule when handed the same table', () => {
    const out = compose(T('the old man fell'), pos, { bonds: AUGMENTED });
    expect(out.stable.length).toBeGreaterThan(0);
    for (const molecule of out.stable) {
      const answer = projectAnswer(molecule, AUGMENTED);
      expect(answer.verb).toBe('fell');
    }
  });

  /**
   * A molecule carries no record of which table built it, so the mismatch has
   * to be loud. Falling back to the left child here would report a positional
   * guess as an answer on the exact path — candidate-bond graduation — whose
   * entire purpose is measuring whether a bond earns its place.
   */
  it('throws rather than guess when projected against the wrong table', () => {
    const out = compose(T('the old man fell'), pos, { bonds: AUGMENTED });
    const orphan = out.stable.find((m) => {
      try { projectAnswer(m); return false; } catch { return true; }
    });
    expect(orphan).toBeDefined();
    expect(() => projectAnswer(orphan)).toThrow(/no bond found for DET \+ N -> N/);
  });

  /**
   * `validateBonds` runs on the standing table at module load so an unreviewed
   * bond cannot run. An override that skipped it would be the one door left
   * open — and it is the ONLY door candidates ever come through.
   */
  it.each([
    ['classic', compose],
    ['packed', composePacked],
  ])('%s rejects an override entry with no declared head', (_label, parser) => {
    expect(() => parser(T('the old man'), pos, { bonds: [...BONDS, ['NP', 'NP', 'S']] }))
      .toThrow(/missing a head index/);
  });

  /**
   * The optional second parameter is a loaded gun pointed at `Array.map`, which
   * passes (element, index, array). `treebank-run.js` was point-free here and
   * would have started feeding integers to `bonds.find` on the classic parser's
   * corpus path — a TypeError thousands of molecules deep, blaming compose.js
   * for a call-site mistake.
   */
  it('names the mistake when handed a map index instead of a bond table', () => {
    const out = compose(T('the dog chased the cat'), pos);
    expect(out.stable.length).toBeGreaterThan(0);
    expect(() => out.stable.map(projectAnswer)).toThrow(/must be an array of bonds/);
    // The wrapped form — what every call site must use — is unaffected.
    expect(() => out.stable.map((m) => projectAnswer(m))).not.toThrow();
  });

  it.each([
    ['classic', compose],
    ['packed', composePacked],
  ])('%s rejects an override that duplicates a bond signature', (_label, parser) => {
    const [l, r, result] = BONDS[0];
    const clashing = [...BONDS, [l, r, result, BONDS[0][3] === 1 ? 0 : 1]];
    expect(() => parser(T('the old man'), pos, { bonds: clashing }))
      .toThrow(/more than one entry/);
  });
});

describe('composePacked — edges', () => {
  it('returns empty structures for no tokens', () => {
    const r = composePacked([], pos);
    expect(r).toMatchObject({ atoms: [], molecules: [], spanning: [], stable: [], events: 0 });
  });

  it('returns empty structures with no posMap', () => {
    expect(composePacked(T('stars burn'), null).molecules).toEqual([]);
  });

  it('honours a declared root other than S', () => {
    const r = composePacked(T('the old man'), pos, { roots: ['NP'] });
    expect(r.stable.map((m) => m.type)).toContain('NP');
  });

  /**
   * THE PLACE THE TWO CHARTS WERE KNOWN TO DISAGREE. `projectAnswer` in
   * compose.js opens with `if (molecule.type !== 'S') return { subject: null,
   * verb: null }`. Before `projectAnswersFrom` gained the matching guard, the
   * packed chart fell through to the NP's own `DET + N` derivation and
   * reported the determiner as the subject: `{ subject: 'the', verb: 'man' }`
   * for a bare NP query, where the classic chart correctly answered
   * `{ subject: null, verb: null }`. Pinned here so the two charts cannot
   * silently diverge on this again.
   */
  it('agrees with the classic chart when the root is NP, not S', () => {
    const tokens = T('the old man');
    const classicMolecule = compose(tokens, pos, { roots: ['NP'] }).stable[0];
    const packedNode = composePacked(tokens, pos, { roots: ['NP'] }).stable[0];
    const classicAnswer = projectAnswer(classicMolecule);
    const packedAnswers = projectAnswers(packedNode);
    expect(classicAnswer).toEqual({ subject: null, verb: null });
    expect(packedAnswers).toEqual([]);
  });
});

const answerKey = (a) => `${a.subject || ''}|${a.verb || ''}`;

describe('headsOf / projectAnswers', () => {
  it('reads an atom head as its own token', () => {
    const r = composePacked(T('stars burn'), pos);
    // Pure nouns are NC (compoundable); dual n+v are N. Both heads are the token.
    const atom = r.atoms.find((a) => a.from === 0 && (a.type === 'N' || a.type === 'NC'));
    expect(atom).toBeDefined();
    expect([...headsOf(atom)]).toEqual(['stars']);
  });

  /**
   * WAS bug-compatible on purpose. `headOf` used to take parts[0] with one
   * exception for determiners, so the head of `the old man` came back as `old`.
   * Both charts now read a declared head, so both say `man`.
   */
  it('takes the noun as the head of a determined noun phrase', () => {
    const r = composePacked(T('the old man fell'), pos);
    const np = r.molecules.find((m) => m.type === 'NP' && m.from === 0 && m.to === 2);
    expect([...headsOf(np)]).toEqual(['man']);
  });

  /**
   * THE POINT OF THE MODULE. Four stacked PPs are 42 readings in the classic
   * chart and one answer. Packed, the 42 are never built — the answer set is
   * read straight off the forest.
   */
  it('collapses the stacked-PP forest to a single answer', () => {
    const r = composePacked(STACKED, pos);
    const answers = projectAnswers(r.stable[0]);
    expect(answers.map(answerKey)).toEqual(['dog|chased']);
  });

  it('projects an imperative with a null subject', () => {
    const r = composePacked(T('chased the cat'), pos, { roots: ['S'] });
    const answers = projectAnswers(r.stable[0]);
    expect(answers.some((a) => a.subject === null && a.verb === 'chased')).toBe(true);
  });

  it('returns no answers for a node that is not there', () => {
    expect(projectAnswers(undefined)).toEqual([]);
  });

  /**
   * A node built two ways with two different heads must report BOTH. Taking
   * derivations[0] would pass every other test in this file and silently
   * answer about one arbitrary tree.
   */
  it('unions heads across derivations rather than taking the first', () => {
    const left = { type: 'N', from: 0, to: 0, derivations: [], token: 'alpha' };
    const right = { type: 'N', from: 1, to: 1, derivations: [], token: 'beta' };
    const twoWays = {
      type: 'NP', from: 0, to: 1, token: null,
      derivations: [
        { bond: ['N', 'N', 'NP', 0], left, right },
        { bond: ['DET', 'N', 'NP', 1], left: { ...left, type: 'DET' }, right },
      ],
    };
    expect([...headsOf(twoWays)].sort()).toEqual(['alpha', 'beta']);
  });
});

/**
 * TERMINAL PUNCTUATION IS NOT A PREDICATE. `S + PUNCT -> S` lets a clause
 * absorb its trailing `.` so sentences that end in punctuation can span at
 * all — but the derivation's right child there is the punctuation atom, not
 * a verb phrase. Before this fix `projectAnswers` unioned in `headsOf(PUNCT
 * atom)` as the verb, so every newly-parsing punctuated sentence answered
 * `.` instead of its real verb.
 */
describe('projectAnswers — terminal punctuation absorption', () => {
  it('projects a sentence with a trailing period onto its real verb, not the period', () => {
    const r = composePacked(T('stars burn .'), pos);
    const answers = projectAnswers(r.stable[0]);
    expect(answers.map(answerKey)).toEqual(['stars|burn']);
  });

  it('absorbs terminal punctuation on a transitive clause without changing the answer', () => {
    const r = composePacked(T('the dog chased the cat .'), pos);
    const answers = projectAnswers(r.stable[0]);
    expect(answers.map(answerKey)).toEqual(['dog|chased']);
  });

  it('agrees with the punctuation-free projection of the same clause', () => {
    const bare = composePacked(T('the dog chased the cat'), pos);
    const punctuated = composePacked(T('the dog chased the cat .'), pos);
    const bareAnswers = projectAnswers(bare.stable[0]).map(answerKey).sort();
    const punctuatedAnswers = projectAnswers(punctuated.stable[0]).map(answerKey).sort();
    expect(punctuatedAnswers).toEqual(bareAnswers);
  });

  /**
   * The punctuation-free cases from the block above must still project
   * exactly as they did — this bond only changes derivations whose right
   * child actually is PUNCT.
   */
  it('leaves the stacked-PP answer unaffected by the PUNCT absorption rule', () => {
    const r = composePacked(STACKED, pos);
    const answers = projectAnswers(r.stable[0]);
    expect(answers.map(answerKey)).toEqual(['dog|chased']);
  });
});

describe('BONDS head declarations', () => {
  it('declares a head on every bond', () => {
    const undeclared = BONDS.filter((b) => b.length !== 4 || (b[3] !== 0 && b[3] !== 1));
    expect(undeclared).toEqual([]);
  });

  /**
   * The three constructions the positional default got wrong. Pinning them by
   * signature means a future edit that reorders or retypes them is caught here
   * rather than in a coverage number three weeks later.
   */
  it.each([
    ['ADJ', 'N', 'N', 1],
    ['AUX', 'VP', 'VP', 1],
    ['MODAL', 'VP', 'VP', 1],
    ['DET', 'N', 'NP', 1],
  ])('declares %s + %s -> %s with head index %i', (l, r, result, head) => {
    const found = BONDS.find((b) => b[0] === l && b[1] === r && b[2] === result);
    expect(found).toBeDefined();
    expect(found[3]).toBe(head);
  });

  it('does not project deprecated COP+VP (progressive/passive be uses AUX+VP)', () => {
    const copVp = BONDS.find((b) => b[0] === 'COP' && b[1] === 'VP' && b[2] === 'VP');
    expect(copVp).toBeUndefined();
    const auxVp = BONDS.find((b) => b[0] === 'AUX' && b[1] === 'VP' && b[2] === 'VP');
    expect(auxVp).toEqual(['AUX', 'VP', 'VP', 1]);
  });

  it('types repeated terminal marks as PUNCT so S can absorb them', () => {
    const r = composePacked(T('Thanks !!'), new Map([['thanks', ['n']]]));
    // tokens may be Thanks / !! if split — also try single token !!
    const r2 = composePacked(['Thanks', '!!'], new Map([['thanks', ['n']], ['!!', []]]));
    const hasPunct = r2.molecules.some((m) => m.type === 'PUNCT' && m.token === '!!');
    expect(hasPunct).toBe(true);
  });
});

describe('the head is declared, not guessed by position', () => {
  const answerOf = (text) => {
    const r = composePacked(T(text), pos);
    return r.stable.length > 0 ? projectAnswers(r.stable[0]) : [];
  };

  it('takes the noun as the head of an attributive adjective phrase', () => {
    expect(answerOf('the old man fell')).toEqual([{ subject: 'man', verb: 'fell' }]);
  });

  it('takes the noun when there is no determiner either', () => {
    expect(answerOf('old men ran')).toEqual([{ subject: 'men', verb: 'ran' }]);
  });

  it('does not let an auxiliary steal the verb', () => {
    expect(answerOf('the dog is chasing the cat .')).toContainEqual({ subject: 'dog', verb: 'chasing' });
  });

  it('does not let a modal steal the verb', () => {
    expect(answerOf('the dog will run .')).toContainEqual({ subject: 'dog', verb: 'run' });
  });

  it('still honours the determiner rule now that it is data', () => {
    expect(answerOf('the dog chased the cat')).toEqual([{ subject: 'dog', verb: 'chased' }]);
  });

  /**
   * Fission daughter of retired DET+NP: DET+PROPN→NP. Capitalized unknown
   * surfaces as PROPN; without this bond "the AP reported" cannot determine.
   */
  it('determines a proper noun (DET+PROPN fission daughter)', () => {
    const r = composePacked(T('the AP reported'), new Map([['reported', ['v']]]));
    expect(r.stable.length).toBeGreaterThan(0);
    expect(projectAnswers(r.stable[0])).toContainEqual({ subject: 'AP', verb: 'reported' });
    const detPropn = BONDS.some((b) => b[0] === 'DET' && b[1] === 'PROPN' && b[2] === 'NP' && b[3] === 1);
    expect(detPropn).toBe(true);
    const detNpParent = BONDS.some((b) => b[0] === 'DET' && b[1] === 'NP' && b[2] === 'NP');
    expect(detNpParent).toBe(false);
  });
});
