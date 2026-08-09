import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const NONFINITE = [
  defineConstruction({
    id: 'to-infinitive',
    family: 'nonfinite',
    left: 'TO', right: 'VP', result: 'INF', head: 1,
    status: S.GRAMMAR,
    relation: 'mark',
    construction: 'to-infinitive',
    roles: { left: 'infinitival-to', right: 'verb-phrase' },
    note: 'TO RUN — UD mark',
    flags: ['ud-aligned'],
  }),
  defineConstruction({
    id: 'np-infinitive',
    family: 'nonfinite',
    left: 'NP', right: 'INF', result: 'NP', head: 0,
    status: S.APPROXIMATION,
    relation: 'acl',
    construction: 'np-infinitival-modifier',
    roles: { left: 'noun-phrase', right: 'infinitive' },
    limitation: 'acl infinitive vs purpose vs relative infinitive collapsed',
    note: 'a man TO SEE',
    flags: ['construction-bundle'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
];
