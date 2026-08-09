import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const CLAUSE = [
  defineConstruction({
    id: 'subject-predicate',
    family: 'clause',
    left: 'NP', right: 'VP', result: 'S', head: 1,
    status: S.GRAMMAR,
    relation: 'root',
    construction: 'declarative-clause',
    roles: { left: 'subject', right: 'predicate' },
    note: 'UD roots a clause on its verb / predicate',
    flags: ['ud-aligned'],
  }),
  defineConstruction({
    id: 'fronted-pp-clause',
    family: 'clause',
    left: 'PP', right: 'S', result: 'S', head: 1,
    status: S.GRAMMAR,
    construction: 'bare-fronted-pp',
    roles: { left: 'fronted-adjunct', right: 'matrix-clause' },
    note: 'In his right hand he grasped … — bare fronting',
    flags: [],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'fronted-adv-clause',
    family: 'clause',
    left: 'ADV', right: 'S', result: 'S', head: 1,
    status: S.APPROXIMATION,
    construction: 'bare-fronted-adv',
    roles: { left: 'fronted-adverb', right: 'matrix-clause' },
    limitation: 'discourse connective vs advmod not split',
    note: 'Bare fronted ADV + clause',
    flags: [],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  /**
   * Hint sim nucleus: ADJ+S→S. Fronted adjectival / predicative fragment
   * attaching to a matrix clause (parallel ADV+S / PP+S bare fronting).
   */
  defineConstruction({
    id: 'fronted-adj-clause',
    family: 'clause',
    left: 'ADJ', right: 'S', result: 'S', head: 1,
    status: S.APPROXIMATION,
    construction: 'bare-fronted-adj',
    roles: { left: 'fronted-adjective', right: 'matrix-clause' },
    limitation:
      'Bundles predicative fronting, secondary predication residue, and '
      + 'title/fragment ADJ before a clause; not typed by discourse role.',
    note: 'Hint nucleus — ADJ+S host extension of ADV/PP fronting',
    flags: ['discovery', 'hint-nucleus'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
];
