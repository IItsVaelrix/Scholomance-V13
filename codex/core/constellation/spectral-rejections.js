/**
 * SPECTRAL REJECTION LEDGER
 *
 * Three color operators were proposed, preregistered, and killed on
 * treebank-gate. This module is the memory. A later session that rediscovers
 * "what if we paint / lock / predict with light" hits a named refusal instead
 * of another spike that rhymes with the last three.
 *
 * LAW: chloroplast energy is a shadow of types and the bond table.
 * It may be inspected. It may not name, lock-replace, or predict a construction.
 *
 * Annotate-only looking is still legal. Promotion into ranking, admission,
 * agenda, or the bond table is not.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/spectral-rejections
 */

import { CYCLOTRON_LAWS } from './bond-admission.js';

export const SPECTRAL_REJECTION_CONTRACT = 'PB-SPECTRAL-REJECTION-LEDGER-v1';

export const SPECTRAL_PROMOTIONS = Object.freeze({
  PAINT: 'paint',
  LOCK_SPLIT: 'lock-split',
  PREDICT: 'predict',
});

export const SPECTRAL_REJECTION_REASON = 'spectral-promotion-rejected';

export const SPECTRAL_REJECTIONS = Object.freeze([
  Object.freeze({
    id: 'spectral-paint',
    promotion: SPECTRAL_PROMOTIONS.PAINT,
    law: 'COLOR_IS_NOT_A_RULE',
    claim: 'Absorption-channel color is a unique fingerprint of a grammatical rule.',
    operator: 'Bucket chloroplast voltage by kind / polarity / range / lock; compose molecules as child sum plus tiny combination excess.',
    verdict: 'FAILS',
    epitaph: 'Everyone glowed gold/blue. Type-only beat the spectrum.',
    fired: Object.freeze(['typeOnlyBeatsOrTiesAccuracy']),
    survived: Object.freeze(['shuffleBeatsOrTiesGap', 'rivalPigmentsCollapse']),
    keyNumbers: Object.freeze({
      familyLoso: '0.1834',
      typeOnlyLoso: '0.4749',
      typeOnlyChance: '0.2033',
    }),
    evidence: 'docs/superpowers/evidence/2026-08-15-spectral-fingerprint-paint.json',
    checksum: 'spectral-paint-v1:4c6b3346c5636b0fd6d9d5f22cc6a24724e38ab761d05c240c0688288e6f2ec9',
    remainsLegal: 'annotate-only inspection of chloroplast voltages',
  }),
  Object.freeze({
    id: 'spectral-lock-split',
    promotion: SPECTRAL_PROMOTIONS.LOCK_SPLIT,
    law: 'SYNC_MUST_NOT_ERASE_LINES',
    claim: 'Syncing pigment frequencies (phase-lock / bonding-antibonding split) paints a molecular color the field can rank by.',
    operator: 'ω_0 on chlorophyll; constructive bonds split; preservative bonds lock or beat; ranking = overlap with the field drive.',
    verdict: 'FAILS',
    epitaph: 'Lock/split erased the barcode. Kappa-zero child lines beat the synced spectrum.',
    fired: Object.freeze([
      'typeOnlyDeprelBeatsOrTies',
      'kappa0NpBeatsOrTies',
      'detuneRankingBeatsOrTies',
    ]),
    survived: Object.freeze([
      'detuneDeprelGapBeatsOrTies',
      'shuffledOmegaDeprelBeatsOrTies',
    ]),
    keyNumbers: Object.freeze({
      npFamilyDesignedLoso: '0.3343',
      npFamilyKappa0Loso: '0.6073',
      npFamilyChance: '0.3546',
      rankingTied: '92/118',
    }),
    evidence: 'docs/superpowers/evidence/2026-08-15-spectral-resonance-sync.json',
    checksum: 'resonance-sync-v1:5496aacd88a5e431160feeb2c3acec89c1aa19e943dad4791c991ca27782d18a',
    remainsLegal: 'lock / beat / split as an extra feature beside unsynced child lines; never as the paint',
  }),
  Object.freeze({
    id: 'spectral-predict',
    promotion: SPECTRAL_PROMOTIONS.PREDICT,
    law: 'COLOR_IS_NOT_A_PREDICTOR',
    claim: 'Leftover field color can forecast gold structure as a tie-breaker once the type pair is known.',
    operator: 'Adjacent leaf barcodes predict gold deprel. Type-pair majority is the baseline; color speaks only on ambiguous type pairs.',
    verdict: 'DEAD',
    epitaph: 'Color broke more ties than it fixed (net −285). Almost shuffle.',
    fired: Object.freeze([
      'typePairBeatsOrTiesHybridOnAmbig',
      'hybridDoesNotRaiseGoldEdge',
    ]),
    survived: Object.freeze([
      'shuffledBeatsOrTiesRealOnAmbig',
      'colorOnlyBeatsOrTiesTypePair',
    ]),
    keyNumbers: Object.freeze({
      ambigTypePairLoso: '0.6157',
      ambigHybridLoso: '0.5020',
      colorFixes: 333,
      colorBreaks: 618,
      net: -285,
    }),
    evidence: 'docs/superpowers/evidence/2026-08-15-spectral-color-predict.json',
    checksum: 'color-predict-v1:b580b119077837da1443ddd9ed4cc660ffa44bb70b1e82cd7777a5b7e4fd8372',
    remainsLegal: 'looking at chloroplast cells; not forecasting gold from them',
  }),
]);

const BY_PROMOTION = new Map(SPECTRAL_REJECTIONS.map((row) => [row.promotion, row]));
const BY_ID = new Map(SPECTRAL_REJECTIONS.map((row) => [row.id, row]));

export function spectralRejection(promotion) {
  return BY_PROMOTION.get(promotion) || null;
}

export function spectralRejectionById(id) {
  return BY_ID.get(id) || null;
}

export function isRejectedSpectralPromotion(promotion) {
  return BY_PROMOTION.has(promotion);
}

/**
 * Runtime gate. Unknown promotions abstain (not a veto). Known dead
 * promotions refuse. Annotate-only vectors with no promotion tag pass.
 */
export function refuseSpectralPromotion(promotion, consumer = null) {
  if (promotion == null || promotion === '') {
    return Object.freeze({
      ok: true,
      reason: null,
      promotion: null,
      rejection: null,
      consumer,
      law: null,
    });
  }
  const row = spectralRejection(promotion);
  if (!row) {
    return Object.freeze({
      ok: true,
      reason: 'unregistered-spectral-promotion',
      promotion,
      rejection: null,
      consumer,
      law: null,
    });
  }
  return Object.freeze({
    ok: false,
    reason: SPECTRAL_REJECTION_REASON,
    promotion,
    rejection: row.id,
    consumer,
    law: CYCLOTRON_LAWS[row.law],
    epitaph: row.epitaph,
    evidence: row.evidence,
    checksum: row.checksum,
  });
}

/**
 * Telemetry may carry an unlabeled spectral vector. A vector that names a
 * rejected promotion is dropped. The chloroplast still reports voltage.
 */
export function admitSpectralResponse(value, consumer = 'spectral-response') {
  if (value == null) return null;
  const promotion = value.promotion || value.kind || null;
  const gate = refuseSpectralPromotion(promotion, consumer);
  if (!gate.ok) return null;
  return value;
}
