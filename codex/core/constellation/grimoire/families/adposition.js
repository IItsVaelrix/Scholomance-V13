import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const ADPOSITION = [
  defineConstruction({
    id: 'prep-np',
    family: 'adposition',
    left: 'P', right: 'NP', result: 'PP', head: 1,
    status: S.GRAMMAR,
    relation: 'case',
    construction: 'prepositional-phrase',
    roles: { left: 'adposition', right: 'nominal-complement' },
    note: 'UD case: adposition is a dependent of its nominal complement',
    flags: ['ud-aligned'],
  }),
  defineConstruction({
    id: 'prep-npo',
    family: 'adposition',
    left: 'P', right: 'NPO', result: 'PP', head: 1,
    status: S.GRAMMAR,
    relation: 'case',
    construction: 'prepositional-phrase-pronominal',
    roles: { left: 'adposition', right: 'pronominal-complement' },
    note: 'UD case on accusative pronoun complement',
    flags: ['ud-aligned'],
  }),
];
