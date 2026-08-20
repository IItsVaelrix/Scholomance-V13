/**
 * Parser failure atlas contract.
 *
 * Research-only. Nothing here admits a root or writes a bond.
 *
 * @module codex/research/parser-failure-atlas/atlas-schema
 */

import { OUTCOME } from '../../core/constellation/failure-diagnosis.js';

export const ATLAS_CONTRACT = 'PB-PARSER-FAILURE-ATLAS-v1';

export const PLATES = Object.freeze([
  'LEXICAL',
  'GRAMMAR',
  'ROOT_TYPE_MISMATCH',
  'CONTAINMENT_MISS',
  'OVERGENERATED',
]);

export const SEALED_SPLIT = 'test';

export const LEFTOVER_TYPES = Object.freeze([
  'SBAR', 'RELC', 'SCOMMA', 'FRONTED', 'INV', 'PUNCT', 'PP', 'APPOS', 'NP', 'NC', 'NPCOMMA', 'PROPN',
]);

/**
 * One plate per sentence. Precedence is deliberate:
 * unparsed outcomes first, then over-generation, then a wrong answer
 * hiding under a spanning S. A clean parse is not a plate.
 */
export function plateOf(row) {
  const outcome = row?.diagnosis?.outcome;
  if (outcome === OUTCOME.LEXICAL) return 'LEXICAL';
  if (outcome === OUTCOME.GRAMMAR) return 'GRAMMAR';
  if (outcome === OUTCOME.ROOT_TYPE_MISMATCH) return 'ROOT_TYPE_MISMATCH';
  if (outcome === OUTCOME.PARSED && row.overGenerated !== true && row.diagnosis?.overGenerated) {
    return 'OVERGENERATED';
  }
  if (outcome === OUTCOME.PARSED && row.diagnosis?.overGenerated) return 'OVERGENERATED';
  if (outcome === OUTCOME.PARSED && row.contained === false) return 'CONTAINMENT_MISS';
  return null;
}

export function isAtlasCase(row) {
  return plateOf(row) != null;
}
