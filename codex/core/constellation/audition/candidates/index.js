export {
  generateFromComposeResult,
  generateFromAnswers,
} from './from-compose.candidate.generator.js';

import { generateFromComposeResult, generateFromAnswers } from './from-compose.candidate.generator.js';
import { CANDIDATE_SOURCES } from '../schemas.js';

/**
 * Unified entry — mirrors G2P `generateCandidates`.
 *
 * @param {string[]} tokens
 * @param {object|null} composeResult  packed or classic result with `stable`
 * @param {object} [options]
 * @returns {object[]}
 */
export function generateCandidates(tokens, composeResult = null, options = {}) {
  if (Array.isArray(options.answers)) {
    return generateFromAnswers(tokens, options.answers, {
      source: options.source || CANDIDATE_SOURCES.MANUAL,
      ...options,
    });
  }
  if (!composeResult) return [];
  return generateFromComposeResult(tokens, composeResult, options);
}
