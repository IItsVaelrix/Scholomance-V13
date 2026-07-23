/**
 * Lexical-rarity banding over corpus sentence-frequency.
 *
 * `RARITY_EDGES` is the ONE versioned tunable (PDR §7). band = 1 + (edges passed),
 * so 8 edges yield bands 1..9. Calibrated provisionally for the ~115k-sentence
 * corpus; recalibrate against the PDR §21.2 difficult-word fixtures. A future
 * corpus-relative (percentile) rarity replaces the edges without a UI change.
 */
export const RARITY_EDGES = Object.freeze([4, 12, 40, 120, 400, 1200, 5000, 20000]);

const LABEL_FOR_BAND = (band) => (band <= 3 ? 'rare' : band <= 6 ? 'uncommon' : 'common');

/**
 * @param {number} freq raw corpus occurrence count (0 = no signal)
 * @returns {{ band: number, max: number, label: string } | null}
 */
export function corpusFreqToRarity(freq) {
  if (!Number.isFinite(freq) || freq <= 0) return null;
  let band = 1;
  for (const edge of RARITY_EDGES) if (freq >= edge) band += 1;
  return { band, max: RARITY_EDGES.length + 1, label: LABEL_FOR_BAND(band) };
}
