import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const SUBORDINATION = [
  defineConstruction({
    id: 'subordinator-clause',
    family: 'subordination',
    left: 'SUB', right: 'S', result: 'SBAR', head: 1,
    status: S.GRAMMAR,
    relation: 'mark',
    construction: 'adverbial-subordinate',
    roles: { left: 'subordinator', right: 'clause' },
    note: 'BECAUSE SHE CAME — UD mark; content clause heads',
    flags: ['ud-aligned'],
  }),
  defineConstruction({
    id: 'matrix-then-subordinate',
    family: 'subordination',
    left: 'S', right: 'SBAR', result: 'S', head: 0,
    status: S.APPROXIMATION,
    relation: 'advcl',
    construction: 'postposed-subordinate',
    roles: { left: 'matrix', right: 'subordinate' },
    limitation: 'advcl vs some ccomp-shaped SUB not split',
    note: 'he left BECAUSE SHE CAME',
    flags: [],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'fronted-subordinate',
    family: 'subordination',
    left: 'SBAR', right: 'S', result: 'S', head: 1,
    status: S.GRAMMAR,
    relation: 'advcl',
    construction: 'fronted-subordinate',
    roles: { left: 'subordinate', right: 'matrix' },
    note: 'BECAUSE SHE CAME, he left — matrix heads',
    flags: ['ud-aligned'],
  }),
];
