/**
 * Truthful Typed Adapter for pixelbrain.soil and pixelbrain.dirt.
 *
 * Conforms to PB-AMP-ABI-v1 (DESCRIPTOR, WORLD_DESCRIPTOR).
 * Generates immutable subterranean soil / dirt ground cover descriptors.
 */

import { deepFreeze } from '../scdl-v2.amp-abi.js';

export class SoilAdapterClass {
  static execute(inputs = {}, params = {}, context = {}) {
    const targetId = inputs.targetId ? String(inputs.targetId) : 'ground_root';

    if (params.depth !== undefined) {
      if (typeof params.depth !== 'number' || !Number.isFinite(params.depth) || params.depth < 0 || !Number.isInteger(params.depth)) {
        throw new TypeError(`Invalid depth '${params.depth}': must be a non-negative integer`);
      }
    }
    const depth = params.depth !== undefined ? params.depth : 16;
    const soilType = typeof params.soilType === 'string' ? params.soilType : 'loam';
    const stratification = typeof params.stratification === 'string' ? params.stratification : 'organic_loam';
    const pebbleDensity = typeof params.pebbleDensity === 'number' && Number.isFinite(params.pebbleDensity)
      ? Math.max(0, Math.min(1, params.pebbleDensity))
      : (params.pebbleDensity === 0 ? 0 : 0.3);
    const rootDensity = typeof params.rootDensity === 'number' && Number.isFinite(params.rootDensity)
      ? Math.max(0, Math.min(1, params.rootDensity))
      : (params.rootDensity === 0 ? 0 : 0.25);
    const moisture = typeof params.moisture === 'number' && Number.isFinite(params.moisture)
      ? Math.max(0, Math.min(1, params.moisture))
      : (params.moisture === 0 ? 0 : 0.5);
    const hasBedrock = params.hasBedrock !== false;

    const pebbleCount = (depth === 0 || pebbleDensity === 0)
      ? 0
      : Math.max(1, Math.round(depth * pebbleDensity * 3));
    const rootCount = (depth === 0 || rootDensity === 0)
      ? 0
      : Math.max(1, Math.round(depth * rootDensity * 2));

    return deepFreeze({
      contract: 'PB-WORLD-DESCRIPTOR-v1',
      kind: 'SOIL',
      targetId,
      depth,
      soilType,
      stratification,
      pebbleDensity,
      rootDensity,
      moisture,
      hasBedrock,
      aspectRatio: 2.0,
      pebbleCount,
      rootCount,
      swatchRamp: {
        soil_dark: '#2c1e14',
        soil_mid: '#4a3322',
        soil_lit: '#6d4c33',
        soil_hi: '#8c6547',
        soil_pebble: '#9c8c7c',
      },
    });
  }

  execute(inputs = {}, params = {}, context = {}) {
    return SoilAdapterClass.execute(inputs, params, context);
  }
}

export function SoilAdapter(inputs, params, context) {
  if (new.target) {
    return new SoilAdapterClass();
  }
  return SoilAdapterClass.execute(inputs, params, context);
}

SoilAdapter.execute = SoilAdapterClass.execute;
SoilAdapter.SoilAdapterClass = SoilAdapterClass;

export default SoilAdapter;
