/**
 * ARCHIVED — src/lib/truesight/color/visemeMapping.js
 *
 * This file was a duplicate of codex/core/shared/truesight/color/visemeMapping.js.
 * Archived during chain consolidation (2026-05-25).
 *
 * Canonical source: codex/core/shared/truesight/color/visemeMapping.js
 * Bridge (active):  src/lib/truesight/color/visemeMapping.js
 *
 * Chain post-consolidation:
 *   src/lib/truesight/color/pcaChroma.js (bridge)
 *     → codex/core/shared/truesight/color/pcaChroma.js
 *       → codex/core/shared/truesight/color/visemeMapping.js (canonical)
 *         → codex/core/pixelbrain/color-byte-mapping.js (consumer)
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function mapFormantsToMetrics(formants) {
  if (!formants || formants.length < 2) return null;

  const [f1, f2] = formants;

  // Normalization ranges based on human vocal tract limits
  // F1 (Openness): 200 - 1000 Hz
  // F2 (Place): 600 - 2500 Hz
  const spreadNorm = clamp((f1 - 200) / 800, 0, 1);
  const centroidNorm = clamp((f2 - 600) / 1900, 0, 1);

  // Sharpness/Distinctness derived from distance from neutral center (schwa-like)
  // Schwa is roughly F1: 500, F2: 1500
  const dx = (f2 - 1500) / 900;
  const dy = (f1 - 500) / 300;
  const distinctNorm = clamp(Math.sqrt(dx*dx + dy*dy) / 1.4, 0, 1);

  return {
    centroidNorm,
    spreadNorm,
    skewNorm: (centroidNorm - 0.5) * 2,
    sharpnessNorm: clamp(0.3 + (distinctNorm * 0.5), 0, 1),
    distinctNorm
  };
}

export function getVisemeStyles(metrics, isAnchor = false) {
  if (!metrics) return {};

  const {
    centroidNorm = 0.5,
    spreadNorm = 0.5,
    skewNorm = 0,
    sharpnessNorm = 0.4,
    distinctNorm = 0.5
  } = metrics;

  const radius = Math.round((1 - centroidNorm) * 12);
  const tracking = (spreadNorm - 0.5) * 0.15;
  const paddingX = 0.1 + (spreadNorm * 0.2);
  const skew = Math.round(skewNorm * 8);
  const contrast = 1 + (sharpnessNorm - 0.4);
  const weight = 400 + Math.round(distinctNorm * 400);
  const shadowBlur = isAnchor ? 0 : 2 + (1 - sharpnessNorm) * 4;

  return {
    '--vb-viseme-radius': `${radius}px`,
    '--vb-viseme-tracking': `${tracking}em`,
    '--vb-viseme-padding-x': `${paddingX}em`,
    '--vb-viseme-skew': `${skew}deg`,
    '--vb-viseme-contrast': contrast.toFixed(2),
    '--vb-viseme-weight': weight,
    '--vb-viseme-shadow-blur': `${shadowBlur}px`,
    '--vb-viseme-brightness': (1.0 + (distinctNorm * 0.35)).toFixed(2),
  };
}
