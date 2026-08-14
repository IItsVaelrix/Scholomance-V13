export const CONSTELLATION_CONTRACT_VERSION = 'cos-page-v2';

/** FNV-1a 32-bit — the repo's deterministic seed convention. */
export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Sorted, canonical serialization of a version map — key order never matters. */
function serializeVersionMap(map) {
  const keys = Object.keys(map || {}).sort();
  return keys.map((k) => `${k}=${map[k]}`).join('|');
}

/**
 * Stable page bytecode. Basis excludes request time, cache status, and user
 * identity (PDR §16) — only inputs that legitimately change the analysis.
 *
 * BASIS (PDR §16 reconstruction, feedback report 2026-08-19 P0-2):
 *   - contract version        (CONSTELLATION_CONTRACT_VERSION)
 *   - normalized query
 *   - query kind
 *   - parsed intent           (NEW — literary/meta-query/craft/comparison
 *                              route to different channels, so two pages with
 *                              the same words but different intent are
 *                              different analyses)
 *   - engine + adapter versions   (engineVersions)
 *   - scoring profile versions    (scoringProfiles — empty until scoring
 *                                  profiles become first-class; the slot is
 *                                  wired so adding them re-keys identity)
 *   - corpus checksum             (corpusChecksum — 'corpus:off' when the
 *                                  corpus is absent; two pages built against
 *                                  different corpora are different analyses)
 *   - deterministic option flags  (flags — which optional channels were
 *                                  measurable: phonology readiness, wordnet,
 *                                  corpus, scale orders)
 *
 * Deliberately EXCLUDED (PDR §16): request time, cache status, measured
 * duration, user identity, animation state, random values, temporary
 * diagnostics. Personal mastery uses a separate overlay bytecode.
 *
 * @param {{ normalized: string, kind: string, intent?: string|null,
 *   engineVersions: Record<string,string>, scoringProfiles?: Record<string,string>,
 *   corpusChecksum?: string|null, flags?: Record<string,string> }} basis
 * @returns {string}
 */
export function computePageBytecode(basis) {
  const material = [
    CONSTELLATION_CONTRACT_VERSION,
    basis.normalized || '',
    basis.kind || '',
    basis.intent || '',
    serializeVersionMap(basis.engineVersions),
    serializeVersionMap(basis.scoringProfiles),
    basis.corpusChecksum || 'corpus:off',
    serializeVersionMap(basis.flags),
  ].join('::');
  const hex = fnv1a32(material).toString(16).toUpperCase().padStart(8, '0');
  return `COS-PAGE-v1-${hex}`;
}
