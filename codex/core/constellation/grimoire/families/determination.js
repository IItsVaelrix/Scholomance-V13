import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

/** Determiners and closed NP glue. */
export const DETERMINATION = [
  defineConstruction({
    id: 'det-noun',
    family: 'determination',
    left: 'DET', right: 'N', result: 'NP', head: 1,
    status: S.GRAMMAR,
    relation: 'det',
    construction: 'np-with-determiner',
    roles: { left: 'determiner', right: 'noun' },
    note: 'UD det: the noun is the head',
    flags: ['ud-aligned'],
  }),
  /**
   * FISSION daughter of held DET+NP→NP.
   * Parent gained packed coverage but isomerized with DET+(N→NP) and exploded
   * the classic forest. Autopsy residual firings (no N on same span) were
   * dominated by DET+PROPN via PROPN→NP lift ("the AP", "the US", …).
   * Mono-family daughter recovers ~79% of parent DEV coverage gain with zero
   * forest multiplier on garden-path / PP-attach pins.
   */
  defineConstruction({
    id: 'det-propn',
    family: 'determination',
    left: 'DET', right: 'PROPN', result: 'NP', head: 1,
    status: S.GRAMMAR,
    relation: 'det',
    construction: 'np-with-determiner-proper',
    roles: { left: 'determiner', right: 'proper-noun' },
    note: 'Fission nucleus — the AP / the FBI; UD det on PROPN',
    flags: ['ud-aligned', 'fission-daughter', 'hint-nucleus'],
  }),
  /**
   * Minor fission daughter: DET+PRON residual ("the one …"). Small holdout
   * gains; forest-clean. Not the main mass of DET+NP.
   */
  defineConstruction({
    id: 'det-pron',
    family: 'determination',
    left: 'DET', right: 'PRON', result: 'NP', head: 1,
    status: S.APPROXIMATION,
    relation: 'det',
    construction: 'np-with-determiner-pronoun',
    roles: { left: 'determiner', right: 'pronoun' },
    limitation: 'Rare; bundles demonstrative-like DET+PRON patterns',
    note: 'Fission daughter — small residual of DET+NP',
    flags: ['fission-daughter'],
    grades: { C: 'Y', R: 'G', H: 'G', X: 'Y' },
  }),
  /**
   * PARENT RETIRED: DET+NP→NP — polydisperse isomer (DET+N ∩ DET+(N→NP)).
   * DET+NC also fissile-toxic (forest 1→4/4/16); do not promote.
   */
];
