import { evaluateSDF, sdfGradient } from './sdf-evaluator.js';
import { setCell } from './template-grid-engine.js';

// Minimum collapse confidence for a phosphorylation to commit.
// buildKinase produces confidence in [0.5, 1.0]. 0.51 excludes the exact rim
// (depth=0 → confidence=0.5); set material.phosphorylationThreshold higher to
// reject more edge cells.
export const COLLAPSE_THRESHOLD = 0.51;

const EMISSION_SCALE = 0.8;    // fraction of qbitEnergy converted to emission glow
const BLEED_AMPLIFIER = 2.0;   // gradient magnitude multiplier for material bleed radius

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function buildKinase(material, sdfDescriptor) {
  if (!material || !sdfDescriptor) {
    return { valid: false, reason: 'MISSING_SUBSTRATE', threshold: undefined, sdfDescriptor: null, call: null };
  }

  // Anchors are sampled in insertion order (rim → core) per material-registry convention
  const anchors = Object.values(material.anchors || {});

  return {
    valid: true,
    reason: null,
    threshold: material.phosphorylationThreshold,
    sdfDescriptor,
    call({ sdfValue, normal, qbitEnergy, qbitGradient }) {
      if (sdfValue > 0) return { color: null, confidence: 0 };

      const depth = Math.min(1, -sdfValue / 20);

      const lightNx = -0.707, lightNy = -0.707;
      const lit = Math.max(0, normal.nx * lightNx + normal.ny * lightNy);
      const shading = 0.4 + 0.6 * lit;

      if (anchors.length === 0) return { color: null, confidence: 0 };

      const idx = Math.min(anchors.length - 1, Math.floor(depth * anchors.length));
      const baseColor = anchors[idx];

      if (!HEX_COLOR_RE.test(baseColor)) return { color: null, confidence: 0 };

      const color = shadedHex(baseColor, shading);
      const confidence = 0.5 + 0.5 * depth;

      // If qbitEnergy is not provided or is null/undefined, return old-style result
      if (qbitEnergy === undefined || qbitEnergy === null) {
        return { color, confidence };
      }

      const emission = Math.min(1, Math.max(0, qbitEnergy * EMISSION_SCALE));

      const gradient = qbitGradient || { gx: 0, gy: 0, gz: 0 };
      const gradientMagnitude = Math.sqrt(gradient.gx * gradient.gx + gradient.gy * gradient.gy + gradient.gz * gradient.gz);
      const materialBleed = Math.min(1, Math.max(0, gradientMagnitude * qbitEnergy * BLEED_AMPLIFIER));

      return { color, confidence, emission, materialBleed };
    },
  };
}

export function phosphorylate(layer, x, y, kinase, options = {}) {
  if (!kinase || !kinase.valid) {
    return { committed: false, reason: kinase?.reason ?? 'MISSING_SUBSTRATE', confidence: 0 };
  }

  const sdfValue = evaluateSDF(kinase.sdfDescriptor, x, y);
  if (!Number.isFinite(sdfValue)) {
    return { committed: false, reason: 'MISSING_SUBSTRATE', confidence: 0 };
  }

  // Outside the shape boundary — treat as missing substrate (no paintable surface here)
  if (sdfValue > 0) {
    return { committed: false, reason: 'MISSING_SUBSTRATE', confidence: 0 };
  }

  const normal = sdfGradient(kinase.sdfDescriptor, x, y);
  if (normal.nx === 0 && normal.ny === 0) {
    return { committed: false, reason: 'MISSING_SUBSTRATE', confidence: 0 };
  }

  let result;
  try {
    result = kinase.call({ sdfValue, normal });
  } catch {
    return { committed: false, reason: 'INVALID_REACTION', confidence: 0 };
  }

  if (!result || !HEX_COLOR_RE.test(result.color)) {
    return { committed: false, reason: 'INVALID_REACTION', confidence: result?.confidence ?? 0 };
  }

  const threshold = options.threshold ?? kinase.threshold ?? COLLAPSE_THRESHOLD;
  if (result.confidence < threshold) {
    return { committed: false, reason: 'LOW_CONFIDENCE', confidence: result.confidence };
  }

  setCell(layer, x, y, result.color);
  return { committed: true, color: result.color, confidence: result.confidence };
}

function shadedHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
