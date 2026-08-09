import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

/**
 * Copular family.
 *
 * UD: be is *cop* when it links subject to a nonverbal predicate.
 * be is *aux* when it accompanies a lexical verb (progressive / passive).
 *
 * COP+VP is the known theory bug: headship is right, category is wrong for
 * progressive/passive. Marked approximation (not grammar) until retyped as AUX.
 */
export const COPULAR = [
  defineConstruction({
    id: 'cop-adj',
    family: 'copular',
    left: 'COP', right: 'ADJ', result: 'VP', head: 1,
    status: S.APPROXIMATION,
    relation: 'cop',
    construction: 'predicative-adjective',
    roles: { left: 'copula', right: 'adjectival-predicate' },
    limitation: 'Result typed VP for projection convenience though predicate is adjectival',
    note: 'is tired — UD cop roots on tired',
    flags: ['ud-cop', 'result-as-vp'],
    grades: { C: 'G', R: 'Y', H: 'G', X: 'G' },
  }),
  defineConstruction({
    id: 'cop-np',
    family: 'copular',
    left: 'COP', right: 'NP', result: 'VP', head: 1,
    status: S.APPROXIMATION,
    relation: 'cop',
    construction: 'predicative-nominal',
    roles: { left: 'copula', right: 'nominal-predicate' },
    limitation: 'Result typed VP for projection convenience',
    note: 'is a man — UD cop roots on man',
    flags: ['ud-cop', 'result-as-vp'],
    grades: { C: 'G', R: 'Y', H: 'G', X: 'G' },
  }),
  defineConstruction({
    id: 'cop-vp-mislabel',
    family: 'copular',
    left: 'COP', right: 'VP', result: 'VP', head: 1,
    status: S.DEPRECATED,
    relation: 'aux',
    construction: 'progressive-or-passive-via-cop-atom',
    roles: { left: 'be-form', right: 'lexical-predicate' },
    limitation:
      'DEPRECATED 2026-08-08: progressive/passive be is UD aux, not cop. '
      + 'Be-forms now emit AUX; use AUX+VP. Head was always 1 (lexical VP). '
      + 'Not projected into BONDS — theory-only intervention, performance flat expected.',
    note: 'Was: is running / was arrested via COP. Migrated to AUX+VP.',
    flags: ['cop-vs-aux', 'theory-wrong-category', 'critical', 'migrated-to-aux-vp'],
    grades: { C: 'Y', R: 'Y', H: 'G', X: 'R' },
  }),
  defineConstruction({
    id: 'cop-infinitive',
    family: 'copular',
    left: 'COP', right: 'INF', result: 'VP', head: 1,
    status: S.APPROXIMATION,
    construction: 'be-to-infinitive',
    roles: { left: 'be-form', right: 'infinitive' },
    limitation: 'is to V is often AUX+mark in UD, not always cop',
    note: 'is TO BE done',
    flags: ['cop-vs-aux'],
    grades: { C: 'Y', R: 'Y', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'cop-sbar',
    family: 'copular',
    left: 'COP', right: 'SBAR', result: 'VP', head: 1,
    status: S.APPROXIMATION,
    relation: 'cop',
    construction: 'cop-clausal-complement',
    roles: { left: 'copula', right: 'clause' },
    limitation: 'is that S packaging; ccomp structure underspecified',
    note: 'is THAT …',
    flags: ['ud-cop'],
    grades: { C: 'Y', R: 'Y', H: 'G', X: 'Y' },
  }),
];
