export const CONSTELLATION_CONTRACT_VERSION = 'cos-page-phase1-v1';

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
 * Stable page bytecode. Basis excludes request time, cache status, and user
 * identity (PDR §16) — only inputs that legitimately change the analysis.
 * @param {{ normalized: string, kind: string, engineVersions: Record<string,string> }} basis
 * @returns {string}
 */
export function computePageBytecode(basis) {
  const versionKeys = Object.keys(basis.engineVersions || {}).sort();
  const versionPart = versionKeys.map((k) => `${k}=${basis.engineVersions[k]}`).join('|');
  const material = [
    CONSTELLATION_CONTRACT_VERSION,
    basis.normalized || '',
    basis.kind || '',
    versionPart,
  ].join('::');
  const hex = fnv1a32(material).toString(16).toUpperCase().padStart(8, '0');
  return `COS-PAGE-v1-${hex}`;
}
