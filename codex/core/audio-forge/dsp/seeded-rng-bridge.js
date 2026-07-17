/**
 * Audio Forge — Seeded RNG Bridge
 *
 * Thin re-export of the Scholomance seeded PRNG for DSP use,
 * plus a string-seed helper for building packet-stable RNG streams.
 *
 * Imports from codex/core/shared — never from src/lib (layer law).
 * No Math.random or Date.now usage. Determinism is law.
 *
 * CLASSIFICATION: core / pure / determinism
 * LAYER: codex/core — NO DOM, NO AudioContext, NO side effects.
 */

import { mulberry32 } from '../../shared/math/seededRng.js';
import { hashString } from '../../pixelbrain/shared.js';

export { mulberry32 };

/**
 * Converts a string seed (e.g. 'battle_14:tile_3:turn_7') into a
 * deterministic uint32 seed via FNV-1a hash, then returns a mulberry32 PRNG.
 *
 * Using the same string seed always produces the same PRNG stream.
 * This allows audio to be reproducible from battle state strings.
 *
 * @param {string} stringSeed
 * @returns {() => number} mulberry32 PRNG function
 */
export function rngFromStringSeed(stringSeed) {
  const seed = hashString(String(stringSeed)) >>> 0; // uint32
  return mulberry32(seed);
}

/**
 * Builds a composite seed string from battle state components.
 * Produces a deterministic, human-readable seed for debugging.
 *
 * @param {object} params
 * @param {string|number} params.battleId
 * @param {string|number} params.tile
 * @param {string|number} params.turn
 * @param {string}        params.eventType
 * @returns {string}
 */
export function buildPacketSeedString({ battleId, tile, turn, eventType }) {
  return `${eventType}:battle_${battleId}:tile_${tile}:turn_${turn}`;
}
