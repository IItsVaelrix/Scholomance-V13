/**
 * SCHOL-COS-PAGE-v4 (2026-08-20, audit repair): `degradedChannels` joined the
 * basis. A channel that threw or timed out changes the packet, and the seal
 * did not move — so a page that lost its rhyme channel produced the same
 * `stablePhase` seed and the same scene id as a whole one. The seal's job is
 * to identify the analysis, and an analysis that lost a channel is a different
 * analysis. The QA golden pin was re-sealed with that rationale.
 *
 * SCHOL-COS-PAGE-v3 (2026-08-20, sem-inquiry-2): additive schema change — the
 * semanticInquiry channel gained `ballistics` and `receiptDigests`. The
 * contract is part of the analysis basis, so the bump legitimately re-keys
 * page bytecode identity; the QA golden pin was re-sealed with that rationale.
 */
export const CONSTELLATION_CONTRACT_VERSION = 'cos-page-v4';

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

/**
 * Sorted, canonical serialization of a channel list. A degradation is a SET of
 * facts, so order and repetition carry nothing; the `degraded:` prefix keeps
 * "no channel died" from serializing as the same empty string a missing field
 * would.
 */
function serializeChannelSet(list) {
  const unique = [...new Set(list || [])].map(String).sort();
  return unique.length === 0 ? 'degraded:none' : `degraded:${unique.join(',')}`;
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
 *   - degraded channels           (degradedChannels — which channels threw or
 *                                  timed out. NEW in v4. A timeout is not an
 *                                  input, but the analysis it produced is a
 *                                  different analysis, and the seal names the
 *                                  analysis. Order-blind: it is a set.)
 *
 * Deliberately EXCLUDED (PDR §16): request time, cache status, measured
 * duration, user identity, animation state, random values, temporary
 * diagnostics. Personal mastery uses a separate overlay bytecode.
 *
 * @param {{ normalized: string, kind: string, intent?: string|null,
 *   engineVersions: Record<string,string>, scoringProfiles?: Record<string,string>,
 *   corpusChecksum?: string|null, flags?: Record<string,string>,
 *   degradedChannels?: string[] }} basis
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
    serializeChannelSet(basis.degradedChannels),
  ].join('::');
  const hex = fnv1a32(material).toString(16).toUpperCase().padStart(8, '0');
  return `COS-PAGE-v1-${hex}`;
}
