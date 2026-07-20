/**
 * Stale-result guard for CODEx Song Stats.
 *
 * Only accepts a result when its source fingerprint matches the live content
 * identity. A mismatched payload is treated as pending/empty — never shown as
 * current — and must not be confused with a compute failure.
 *
 * When compute truly fails, last-good may be shown only if its fingerprint
 * still matches the live content.
 */

/** @typedef {import('./types.js').SongStatsResult} SongStatsResult */

/**
 * @param {{
 *   computeFailed: boolean,
 *   lastGood: SongStatsResult | null | undefined,
 *   currentFingerprint: string | null | undefined,
 *   nextResult: SongStatsResult | null | undefined,
 * }} params
 * @returns {SongStatsResult | null}
 */
export function resolveSongStatsDisplay({ computeFailed, lastGood, currentFingerprint, nextResult }) {
  if (nextResult?.meta?.sourceFingerprint === currentFingerprint) {
    return nextResult;
  }

  // Mismatched or absent nextResult: never display a fingerprint that does not
  // match the current editor identity. Fall back to last-good only on a true
  // compute failure for the same content.
  if (computeFailed && lastGood?.meta?.sourceFingerprint === currentFingerprint) {
    return lastGood;
  }

  return null;
}
