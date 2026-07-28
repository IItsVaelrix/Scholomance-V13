/**
 * evaluateRealizationEquivalence — PB-REALIZATION-EQUIVALENCE-v1
 */

import { EQUIVALENCE_SCHEMA, DEFAULT_SCALES, deepFreeze, contentHash } from './schema.js';
import { prepareSpecimen, vesselReference, vesselPixelOnly, vesselVectorOnly, vesselScaled } from './vessels-lattice.js';
import { vesselSvg } from './vessels-svg.js';
import { vesselCanvas } from './vessels-canvas.js';
import { vesselPixi } from './vessels-pixi.js';
import { measureDrifts, classifyEquivalence } from './metrics.js';

/**
 * @param {object} input VixelField or SpatialField
 * @param {object} [options]
 */
export async function evaluateRealizationEquivalence(input, options = {}) {
  const specimen = prepareSpecimen(input);
  const scales = options.scales ?? DEFAULT_SCALES;
  const reasons = [];

  const vessels = [];

  vessels.push(vesselReference(specimen));
  vessels.push(vesselSvg(specimen));
  vessels.push(vesselCanvas(specimen));

  // Pixi is hard-required — do not catch
  vessels.push(await vesselPixi(specimen, options));

  vessels.push(vesselPixelOnly(specimen));
  vessels.push(vesselVectorOnly(specimen));

  for (const s of scales) {
    if (s === 1) continue;
    vessels.push(vesselScaled(specimen, s, 'reference'));
  }

  const ref = vessels.find((v) => v.id === 'reference');
  const pairwise = [];
  for (const v of vessels) {
    if (v.id === 'reference') continue;
    const drifts = measureDrifts(ref, v);
    pairwise.push({
      a: 'reference',
      b: v.id,
      drifts,
    });
  }

  const equivalenceClass = classifyEquivalence(pairwise);

  const packet = {
    schema: EQUIVALENCE_SCHEMA,
    specimenId: specimen.id,
    vessels: vessels.map((v) => ({
      id: v.id,
      backend: v.backend,
      scale: v.scale,
      artifactHash: v.artifactHash,
      width: v.width,
      height: v.height,
    })),
    pairwise,
    equivalenceClass,
    reasons,
    equivalenceHash: '',
  };
  packet.equivalenceHash = contentHash({
    vessels: packet.vessels,
    pairwise: packet.pairwise,
    equivalenceClass,
  });

  return deepFreeze(packet);
}

export { vesselPixi, vesselCanvas, vesselSvg };
