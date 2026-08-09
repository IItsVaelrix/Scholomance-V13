import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

export const PARTICIPIAL = [
  defineConstruction({
    id: 'verb-pp-participle',
    family: 'participial',
    left: 'V', right: 'PP', result: 'PART', head: 0,
    status: S.APPROXIMATION,
    construction: 'reduced-relative-or-participle',
    roles: { left: 'verb', right: 'pp' },
    limitation: 'Garden-path isomer with verb-pp; PART is a non-UD working label',
    note: 'Isomer: raced past the barn as participial modifier',
    flags: ['isomer', 'scaffold-result'],
    grades: { C: 'G', R: 'Y', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'np-participle',
    family: 'participial',
    left: 'NP', right: 'PART', result: 'NP', head: 0,
    status: S.APPROXIMATION,
    relation: 'acl',
    construction: 'reduced-relative',
    roles: { left: 'noun-phrase', right: 'participial-modifier' },
    limitation: 'acl / amod and full relative family not distinguished',
    note: 'the horse raced past the barn',
    flags: ['construction-bundle'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
];
