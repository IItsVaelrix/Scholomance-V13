import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

/**
 * Subject-aux inversion: auxiliary binds subject first (INV scaffold),
 * then takes the predicate. INV is not a free-standing linguistic constituent.
 */
export const INVERSION = [
  /**
   * INVERSION SCAFFOLD HEADS ON THE NOMINAL, NOT THE AUXILIARY.
   *
   * `head: 0` put the auxiliary at the head of the INV, so `headedAtoms(INV)`
   * returned `are` for `are you kidding ?` and the answer came out
   * {subject: are, verb: kidding}. Measured 2026-08-20: every sentence whose
   * root S was built through INV was wrong — 0 correct out of 9 on the gate
   * corpus.
   *
   * UD makes the inverted nominal the `nsubj` of the main predicate and the
   * auxiliary its `aux` dependent. INV is a parser-assembly scaffold; the thing
   * inside it that a later `INV+VP -> S` needs is the SUBJECT. So the head is
   * the NP.
   */
  defineConstruction({
    id: 'modal-np-inv',
    family: 'inversion',
    left: 'MODAL', right: 'NP', result: 'INV', head: 1,
    status: S.SCAFFOLD,
    construction: 'subject-aux-inversion-bridge',
    roles: { left: 'modal', right: 'subject' },
    note: 'SHALL WE … — INV bundles aux+subject; aux heads INV by ruling',
    flags: ['scaffold-result', 'ruling', 'inversion'],
    grades: { C: 'Y', R: 'Y', H: 'Y', X: 'G' },
  }),
  defineConstruction({
    id: 'aux-np-inv',
    family: 'inversion',
    left: 'AUX', right: 'NP', result: 'INV', head: 1,
    status: S.SCAFFOLD,
    construction: 'subject-aux-inversion-bridge',
    note: 'DID HE …',
    flags: ['scaffold-result', 'ruling', 'inversion'],
    grades: { C: 'Y', R: 'Y', H: 'Y', X: 'G' },
  }),
  defineConstruction({
    id: 'cop-np-inv',
    family: 'inversion',
    left: 'COP', right: 'NP', result: 'INV', head: 1,
    status: S.SCAFFOLD,
    construction: 'subject-aux-inversion-bridge',
    limitation: 'Is he … : be may be cop or aux depending on following predicate',
    note: 'IS HE …',
    flags: ['scaffold-result', 'ruling', 'inversion', 'cop-vs-aux'],
    grades: { C: 'Y', R: 'Y', H: 'Y', X: 'Y' },
  }),
  defineConstruction({
    id: 'inv-vp',
    family: 'inversion',
    left: 'INV', right: 'VP', result: 'S', head: 1,
    status: S.APPROXIMATION,
    construction: 'inverted-question-verbal',
    roles: { left: 'inv-bridge', right: 'lexical-predicate' },
    limitation: 'Polar/aux questions; content verb heads — good; left child is scaffold',
    note: 'Shall we go',
    flags: ['inversion'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'inv-adj',
    family: 'inversion',
    left: 'INV', right: 'ADJ', result: 'S', head: 1,
    status: S.GRAMMAR,
    relation: 'cop',
    construction: 'inverted-copular-adjective',
    roles: { left: 'inv-bridge', right: 'adjectival-predicate' },
    note: 'is he happy — UD cop roots on happy',
    flags: ['ud-aligned', 'inversion'],
  }),
  defineConstruction({
    id: 'inv-np',
    family: 'inversion',
    left: 'INV', right: 'NP', result: 'S', head: 1,
    status: S.GRAMMAR,
    relation: 'cop',
    construction: 'inverted-copular-nominal',
    roles: { left: 'inv-bridge', right: 'nominal-predicate' },
    note: 'is he a doctor — UD cop roots on noun',
    flags: ['ud-aligned', 'inversion'],
  }),
];
