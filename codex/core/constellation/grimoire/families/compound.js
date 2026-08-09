import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

/**
 * Compound / name chemistry refined from construction autopsy.
 *
 * Do NOT use a giant NP+NP→NP. Families here are narrow:
 *   - noun-noun compound (UD compound, head = right)
 *   - proper-name sequence (compound-biased head = right; flat-name is next refine)
 *   - mixed PROPN+N / N+PROPN
 *
 * Status starts as approximation until gated re-sim proves clean enough for grammar.
 */
export const COMPOUND = [
  defineConstruction({
    id: 'compound-nn',
    family: 'compound',
    left: 'NC', right: 'NC', result: 'NC', head: 1,
    status: S.APPROXIMATION,
    relation: 'compound',
    construction: 'noun-noun-compound',
    roles: { left: 'modifier-noun', right: 'head-noun' },
    limitation:
      'NC = pure nominal (not dual n+v). Dual verbs keep N for subjects but cannot compound '
      + '(prevents barn+fell). Result NC stacks (coffee cup holder). Lift NC→N→NP. '
      + 'UD compound head = RIGHT noun.',
    note: 'coffee cup / car bomb / research lab — NC+NC after closed-class gate',
    flags: ['ud-aligned-head', 'discovery', 'autopsy-refined'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'proper-compound',
    family: 'compound',
    left: 'PROPN', right: 'PROPN', result: 'N', head: 1,
    status: S.APPROXIMATION,
    relation: 'compound',
    construction: 'proper-name-compound',
    roles: { left: 'name-left', right: 'name-head' },
    limitation:
      'Autopsy split: ~40% compound, ~23% flat-name, ~14% nmod-desc. Single law is compound-biased; '
      + 'flat-name (head left) remains a follow-up split.',
    note: 'US Marines / Investment Partners — PROPN sequence → N then NP lift',
    flags: ['discovery', 'autopsy-refined'],
    grades: { C: 'G', R: 'Y', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'proper-plus-noun',
    family: 'compound',
    left: 'PROPN', right: 'N', result: 'N', head: 1,
    status: S.APPROXIMATION,
    relation: 'compound',
    construction: 'proper-plus-common',
    roles: { left: 'proper', right: 'common-noun' },
    note: 'Name + common noun',
    flags: ['discovery'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
  defineConstruction({
    id: 'noun-plus-proper',
    family: 'compound',
    left: 'N', right: 'PROPN', result: 'N', head: 1,
    status: S.APPROXIMATION,
    relation: 'compound',
    construction: 'common-plus-proper',
    roles: { left: 'common-noun', right: 'proper' },
    note: 'Common noun + name',
    flags: ['discovery'],
    grades: { C: 'G', R: 'G', H: 'G', X: 'Y' },
  }),
];
