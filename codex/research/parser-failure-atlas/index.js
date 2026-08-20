/**
 * Parser failure atlas. Consumes compose + diagnose. Never writes a bond.
 *
 * @module codex/research/parser-failure-atlas
 */

export {
  ATLAS_CONTRACT,
  LEFTOVER_TYPES,
  PLATES,
  SEALED_SPLIT,
  isAtlasCase,
  plateOf,
} from './atlas-schema.js';
export { collectFailures, scoreRecord, selectAtlasCases } from './collect-failures.js';
export { freezeFailure } from './freeze-case.js';
export { plateAtlas, refuseTest } from './plate.js';
export { rankConstructionHoles, rankLeftoverTypes } from './rank-constructions.js';
export { buildAtlas } from './build-atlas.js';
export {
  INTERIOR_WATCHLIST,
  isClauseRootLabel,
  interiorConstructions,
  replicateInteriors,
} from './replicate-interiors.js';
export {
  PUNCT_FAMILIES,
  classifyPunctConstruction,
  clusterPunctuation,
} from './cluster-punctuation.js';
