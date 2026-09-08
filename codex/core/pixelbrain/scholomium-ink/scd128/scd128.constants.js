/**
 * Scholomium Ink — SCD128 Wire Constants and Slot Registries
 *
 * Physical Layout:
 *   128 uppercase hexadecimal characters = 16 blocks × 8 hexadecimal characters
 *   SCD128 = FORM64 (blocks 01-08) || REALIZATION64 (blocks 09-16)
 *
 * Prefixes:
 *   FORM64 slot 0 block begins with '81' (version 1) + 6 hex chars.
 *   REALIZATION64 slot 0 block begins with '91' (version 1) + 6 hex chars.
 */

export const FORM64_SLOT_NAMES = Object.freeze([
  'ASSET_CLASS',
  'SCALE_FRAME',
  'SILHOUETTE',
  'STRUCTURAL_SKELETON',
  'PROPORTION',
  'MASS_DISTRIBUTION',
  'NEGATIVE_SPACE',
  'WORLD_FOOTPRINT',
]);

export const REALIZATION64_SLOT_NAMES = Object.freeze([
  'PIXEL_DENSITY',
  'EDGE_LANGUAGE',
  'CLUSTER_RHYTHM',
  'VALUE_HIERARCHY',
  'MATERIAL_LANGUAGE',
  'PALETTE_LOGIC',
  'LIGHT_RESPONSE',
  'SURFACE_VARIATION',
]);

export const FORM64_VERSION_PREFIX = '81';
export const REALIZATION64_VERSION_PREFIX = '91';

export const SCD128_WIRE_LENGTH = 128;
export const BANK_WIRE_LENGTH = 64;
export const BLOCK_HEX_LENGTH = 8;
export const BLOCKS_PER_BANK = 8;
export const TOTAL_BLOCKS = 16;

export const SCD128_REGEX = /^[0-9A-F]{128}$/;
export const FORM64_REGEX = /^81[0-9A-F]{62}$/;
export const REALIZATION64_REGEX = /^91[0-9A-F]{62}$/;
export const BLOCK_HEX_REGEX = /^[0-9A-F]{8}$/;
export const DIGEST256_REGEX = /^[0-9A-F]{64}$/;

export const CONFIDENCE_LEVELS = Object.freeze([
  'measured',
  'authored',
  'inferred',
  'unbound',
]);

export const SCD128_ERROR_CODES = Object.freeze({
  FORM_SCHEMA: 'SCD128_FORM_SCHEMA',
  REALIZATION_SCHEMA: 'SCD128_REALIZATION_SCHEMA',
  FORBIDDEN_FIELD: 'SCD128_FORBIDDEN_FIELD',
  DIGEST_MISMATCH: 'SCD128_DIGEST_MISMATCH',
  BLOCK_COLLISION: 'SCD128_BLOCK_COLLISION',
  BANK_VERSION: 'SCD128_BANK_VERSION',
  COUNSEL_CONFLICT: 'SCD128_COUNSEL_CONFLICT',
  COUNSEL_UNBOUND: 'SCD128_COUNSEL_UNBOUND',
  PROJECTION_REFUSED: 'SCD128_PROJECTION_REFUSED',
  QUARANTINE_VIOLATION: 'SCD128_QUARANTINE_VIOLATION',
  CORPUS_ADMISSION: 'SCD128_CORPUS_ADMISSION',
});
