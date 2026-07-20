/**
 * Stable source fingerprint from song-stats inputs (FNV-1a 32-bit).
 *
 * @param {{
 *   raw: string,
 *   rhymeWindow: number,
 *   bpm?: number,
 *   beatsPerLine?: number,
 *   alignmentFingerprint?: string | null,
 *   beatGridFingerprint?: string | null,
 *   alignmentId?: string | null,
 *   beatGridId?: string | null,
 * }} inputs
 * @returns {string}
 */
export function buildSourceFingerprint({ raw, rhymeWindow, alignmentId = null, beatGridId = null }) {
  const {
    bpm,
    beatsPerLine,
    alignmentFingerprint = alignmentId,
    beatGridFingerprint = beatGridId,
  } = arguments[0];
  const payload = JSON.stringify({
    raw,
    rhymeWindow,
    bpm,
    beatsPerLine,
    alignmentFingerprint,
    beatGridFingerprint,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
