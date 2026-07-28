/**
 * PB-REALIZATION-EQUIVALENCE-v1 — schema + hashing
 */

export const EQUIVALENCE_SCHEMA = 'PB-REALIZATION-EQUIVALENCE-v1';
export const MANIFEST_SCHEMA = 'PB-VISUAL-EXECUTION-MANIFEST-v1';
export const VERDICT_EVIDENCE_SCHEMA = 'PB-RETINA-VERDICT-EVIDENCE-v1';

export const DEFAULT_SCALES = Object.freeze([1, 2, 4]);
export const VESSEL_IDS = Object.freeze([
  'reference',
  'svg',
  'canvas',
  'pixi',
  'pixel-only',
  'vector-only',
]);

export function quantize6(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Math.round(n * 1e6) / 1e6;
}

export function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function contentHash(obj) {
  const str = stableStringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return obj;
}
