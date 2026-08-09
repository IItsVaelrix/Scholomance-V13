import { defineConstruction, CONSTRUCTION_STATUS as S } from '../schemas.js';

/**
 * Coordination is ternary; binary table uses bridge scaffolds.
 * CONJNP / CONJVP / CONJS are parser assembly — not free-standing UD constituents.
 * First conjunct as technical head matches UD's dependency convention.
 */
export const COORDINATION = [
  defineConstruction({
    id: 'coord-np-bridge',
    family: 'coordination',
    left: 'CONJ', right: 'NP', result: 'CONJNP', head: 1,
    status: S.SCAFFOLD,
    construction: 'coord-right-partial-np',
    roles: { left: 'coordinator', right: 'right-conjunct' },
    note: 'Parser assembly state; not claimed as linguistic constituency.',
    flags: ['scaffold-result', 'coordination'],
  }),
  defineConstruction({
    id: 'coord-np-complete',
    family: 'coordination',
    left: 'NP', right: 'CONJNP', result: 'NP', head: 0,
    status: S.GRAMMAR,
    relation: 'conj',
    construction: 'np-coordination',
    roles: { left: 'first-conjunct', right: 'coord-bridge' },
    note: 'UD conj attaches to the first conjunct',
    flags: ['ud-aligned', 'coordination'],
  }),
  defineConstruction({
    id: 'coord-vp-bridge',
    family: 'coordination',
    left: 'CONJ', right: 'VP', result: 'CONJVP', head: 1,
    status: S.SCAFFOLD,
    construction: 'coord-right-partial-vp',
    note: 'Parser assembly state; not claimed as linguistic constituency.',
    flags: ['scaffold-result', 'coordination'],
  }),
  defineConstruction({
    id: 'coord-vp-complete',
    family: 'coordination',
    left: 'VP', right: 'CONJVP', result: 'VP', head: 0,
    status: S.GRAMMAR,
    relation: 'conj',
    construction: 'vp-coordination',
    note: 'UD conj — first conjunct heads',
    flags: ['ud-aligned', 'coordination'],
  }),
  defineConstruction({
    id: 'coord-s-bridge',
    family: 'coordination',
    left: 'CONJ', right: 'S', result: 'CONJS', head: 1,
    status: S.SCAFFOLD,
    construction: 'coord-right-partial-s',
    note: 'Parser assembly state; not claimed as linguistic constituency.',
    flags: ['scaffold-result', 'coordination'],
  }),
  defineConstruction({
    id: 'coord-s-complete',
    family: 'coordination',
    left: 'S', right: 'CONJS', result: 'S', head: 0,
    status: S.GRAMMAR,
    relation: 'conj',
    construction: 'clausal-coordination',
    note: 'UD conj — first clause heads',
    flags: ['ud-aligned', 'coordination'],
  }),
  defineConstruction({
    id: 'discourse-initial-and',
    family: 'coordination',
    left: 'CONJ', right: 'S', result: 'S', head: 1,
    status: S.APPROXIMATION,
    construction: 'discourse-initial-coordinator',
    roles: { left: 'coordinator', right: 'clause' },
    limitation: 'Not true two-conjunct coordination; left conjunct is outside the input',
    note: 'And the Spirit of God moved…',
    flags: ['discourse-initial'],
    grades: { C: 'Y', R: 'G', H: 'G', X: 'Y' },
  }),
  /**
   * ADJECTIVAL COORDINATION IS A PAIR. The bridge alone is a dead end: nothing
   * consumes `CONJADJ`, so it can never reach a spanning `S`, and its measured
   * effect was confined to span/root cosmetics (ablation 2026-08-08: removing it
   * cost Δcov 0 / Δens 0 on both splits, Δspan −0.12pp DEV).
   *
   * The completion was recorded NO-GAIN by the hint simulation, but that verdict
   * was structural, not empirical: the reactor adds one candidate at a time, and
   * with no bridge in the baseline nothing produced `CONJADJ`, so the completion
   * could not fire even once. Measured as a pair it holds out —
   * DEV +7 cov / +8 root / +6 ens, TEST +7 cov / +13 root / +7 ens.
   *
   * Keep these two together. Removing either one makes the other inert.
   */
  defineConstruction({
    id: 'coord-adj-bridge',
    family: 'coordination',
    left: 'CONJ', right: 'ADJ', result: 'CONJADJ', head: 1,
    status: S.SCAFFOLD,
    construction: 'coord-right-partial-adj',
    roles: { left: 'coordinator', right: 'right-conjunct' },
    note: 'Adj coordination bridge — inert without coord-adj-complete',
    flags: ['scaffold-result', 'coordination', 'hint-nucleus'],
  }),
  defineConstruction({
    id: 'coord-adj-complete',
    family: 'coordination',
    left: 'ADJ', right: 'CONJADJ', result: 'ADJ', head: 0,
    status: S.GRAMMAR,
    relation: 'conj',
    construction: 'adjectival-coordination',
    roles: { left: 'first-conjunct', right: 'coord-bridge' },
    note: 'UD conj — first adjective heads; completes coord-adj-bridge',
    flags: ['ud-aligned', 'coordination'],
  }),
];
