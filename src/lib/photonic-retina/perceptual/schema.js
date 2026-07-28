/**
 * Perceptual Quality Trio — schema constants + hashing helpers
 * @bytecode PB-PERCEPTUAL-FEATURES-v1 / PB-COMPOSITION-EVIDENCE-v1 / PB-PHENOTYPE-FIDELITY-v1
 */

export const FEATURE_SCHEMA = 'PB-PERCEPTUAL-FEATURES-v1';
export const COMPOSITION_SCHEMA = 'PB-COMPOSITION-EVIDENCE-v1';
export const FIDELITY_SCHEMA = 'PB-PHENOTYPE-FIDELITY-v1';

export const BALANCE_MODES = Object.freeze([
  'symmetric',
  'radial',
  'dynamic',
  'deliberately-imbalanced',
]);

export const ROLE_IMPORTANCE = Object.freeze({
  focal: 1.0,
  body: 1.0,
  rim: 0.6,
  constructionGuide: 0.2,
});

export function quantize6(n) {
  if (n === null || n === undefined) return null;
  if (!Number.isFinite(n)) return null;
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

export function dualClaim(declared, measured) {
  if (declared === undefined || measured === undefined) {
    return null;
  }
  // Ceremony guard: identical object identity or same substrate marker
  if (declared && measured && declared.__substrate && measured.__substrate
      && declared.__substrate === measured.__substrate) {
    return { omitted: true, reason: 'ceremony-rejected' };
  }
  const agreement = computeAgreement(declared, measured);
  return Object.freeze({ declared, measured, agreement });
}

function computeAgreement(declared, measured) {
  if (typeof declared === 'number' && typeof measured === 'number') {
    const d = Math.abs(declared - measured);
    return quantize6(Math.max(0, 1 - d));
  }
  if (typeof declared === 'string' && typeof measured === 'string') {
    return declared === measured ? 1 : 0;
  }
  if (declared && measured && typeof declared === 'object' && typeof measured === 'object') {
    if ('x' in declared && 'y' in declared && 'x' in measured && 'y' in measured) {
      const dist = Math.hypot(declared.x - measured.x, declared.y - measured.y);
      return quantize6(Math.max(0, 1 - dist));
    }
  }
  return quantize6(declared === measured ? 1 : 0);
}
