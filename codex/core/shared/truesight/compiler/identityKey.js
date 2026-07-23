/**
 * Identity Key Authority — Canonical position-bound text identity
 *
 * Moved here from src/lib/lexical/charStart.js to eliminate the forbidden
 * codex/core → src/ import (LING-0F03). charStart.js re-exports from here
 * so all consumers stay on ONE definition.
 *
 * Pure function — no framework dependencies.
 *
 * @bytecode SCHOL-TRUESIGHT-IDENTITY-KEY
 */

/**
 * Build the canonical identity key for a word at a position.
 * The format `${text.toLowerCase()}-${charStart}` is what the upstream
 * analysis produces and what consumers expect.
 *
 * @param {string} text - The word text.
 * @param {number} charStart - The canonical charStart.
 * @returns {string} The identity key.
 */
export function buildIdentityKey(text, charStart) {
  return `${String(text || '').toLowerCase()}-${charStart}`;
}
