/**
 * PixelBrain AMP wrapper for the literal SWARD grass engine port.
 *
 * The AMP surface intentionally stays narrow: callers select dimensions and a
 * seed; the engine owns the proven SWARD creative defaults. Studio callers
 * that need the full density/wind/soil/blade/palette controls use
 * `generateGrass` through the dedicated Foundry adapter instead.
 *
 * @bytecode PB-GRASS-FIELD-v5
 */
import { defaultParams, generateGrass } from './grass-engine.js';

export const GRASS_AMP_ID = 'grass';
export const GRASS_AMP_VERSION = '5.0.0';

export const GRASS_COLOR = Object.freeze({
  SOIL: 0,
  BED: 1,
  RAISED: 2,
  ROOT: 3,
  LEAF: 4,
  TIP: 5,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function GrassAMP({ width, height, seed } = {}) {
  const defaults = defaultParams();
  return generateGrass({
    ...defaults,
    width: width ?? defaults.width,
    height: height ?? defaults.height,
    seed: seed ?? defaults.seed,
  });
}

export const GRASS_AMP_SEAM = deepFreeze({
  // Stable public seam from the prior AMP. The implementation/version changes,
  // but downstream terrain consumers keep the same identifier and merge law.
  id: 'grass-v3',
  processor: GRASS_AMP_ID,
  version: GRASS_AMP_VERSION,
  consumes: [],
  emits: ['field', 'palette'],
  mutates: [],
  mergeContract: 'grass-tile-field-form-first-v3',
});

export default deepFreeze({
  GrassAMP,
  id: GRASS_AMP_ID,
  seam: GRASS_AMP_SEAM,
});
