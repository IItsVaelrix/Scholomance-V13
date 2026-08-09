import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const POSSESSION = [
  defineConstruction({
    id: 'poss-noun',
    family: 'possession',
    left: 'POSS', right: 'N', result: 'N', head: 1,
    status: S.APPROXIMATION,
    relation: 'nmod:poss',
    construction: 'possessive-determiner',
    roles: { left: 'possessor-det', right: 'noun' },
    limitation: 'Result typed N for stacking like ADJ+N',
    note: "my / his + N",
    flags: ['stack-hack', 'ud-aligned-head'],
    grades: { C: 'G', R: 'Y', H: 'G', X: 'G' },
  }),
  defineConstruction({
    id: 'np-poss-gen',
    family: 'possession',
    left: 'NP', right: 'POSS', result: 'GEN', head: 0,
    status: S.SCAFFOLD,
    construction: 'possessor-phrase-bridge',
    roles: { left: 'possessor-np', right: 'clitic' },
    note: "the old man + 'S — GEN is assembly; head on possessor is a ruling",
    flags: ['scaffold-result', 'ruling'],
    grades: { C: 'Y', R: 'Y', H: 'Y', X: 'Y' },
  }),
  defineConstruction({
    id: 'gen-possessed',
    family: 'possession',
    left: 'GEN', right: 'N', result: 'NP', head: 1,
    status: S.GRAMMAR,
    relation: 'nmod:poss',
    construction: 's-genitive',
    roles: { left: 'possessor-gen', right: 'possessed-noun' },
    note: "UD nmod:poss: the POSSESSED noun is the head",
    flags: ['ud-aligned'],
  }),
];
