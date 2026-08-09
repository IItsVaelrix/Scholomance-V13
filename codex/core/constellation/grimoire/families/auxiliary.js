import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const AUXILIARY = [
  defineConstruction({
    id: 'aux-vp',
    family: 'auxiliary',
    left: 'AUX', right: 'VP', result: 'VP', head: 1,
    status: S.GRAMMAR,
    relation: 'aux',
    construction: 'auxiliary-plus-lexical-predicate',
    roles: { left: 'auxiliary', right: 'lexical-predicate' },
    limitation:
      'Bundles perfect, do-support, progressive, and passive under one AUX+VP; '
      + 'construction subtypes not yet split, but the category is UD-correct (aux).',
    note: 'had gone / is running / was arrested — UD aux; lexical VP is head',
    flags: ['ud-aux', 'ud-aligned'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'modal-vp',
    family: 'auxiliary',
    left: 'MODAL', right: 'VP', result: 'VP', head: 1,
    status: S.GRAMMAR,
    relation: 'aux',
    construction: 'modal',
    roles: { left: 'modal', right: 'lexical-predicate' },
    note: 'can run — UD aux (modal)',
    flags: ['ud-aligned'],
  }),
];
