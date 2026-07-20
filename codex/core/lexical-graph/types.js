// codex/core/lexical-graph/types.js
/**
 * @typedef {'word'|'phrase'|'device'|'idiom'|'symbol'|'allusion'|'motif'} LexicalEntryType
 * @typedef {'synonym'|'antonym'|'rhymes_with'|'sounds_like'|'symbolizes'|'evokes'|'intensifies'|'contrasts_with'|'commonly_follows'|'example_of'|'used_with'|'commonly_confused_with'|'related_device'} LexicalRelationKind
 * @typedef {'token_repeat'|'syntactic_parallel'|'semantic_opposition'|'comparison_marker'|'line_position'|'semantic_incongruity'|'custom'} DetectionSignalKind
 */
export const LEXICAL_GRAPH_SCHEMA_VERSION = '2';
export const LITERARY_DEVICE_SEED_VERSION = '1';
export const DEVICE_EMBEDDING_KIND = 'phonosemantic_mock';
export const DEVICE_EMBEDDING_VERSION = 'tq-js-v1';
export const DEVICE_EMBEDDING_DIMENSIONS = 256;
export const LEGACY_EMBEDDING_KIND = 'legacy_turboquant';
export const ANALYSIS_CONTEXT_VERSION = 'ANALYSIS_CONTEXT_v1';
export const CONTEXT_HASH_ALGORITHM = 'sha256-canonical-v1';
export const MORPHOLOGY_VERSION = 'LEMMA_FORM_v1';
export const LEMMA_RANK_FORMULA_VERSION = 'LEMMA_RANK_v1';
