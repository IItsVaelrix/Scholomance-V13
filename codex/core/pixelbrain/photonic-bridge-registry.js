/**
 * Photonic Bridge Registry — Dependency Injection for codex/core → src/ bridge
 *
 * Solves LING-0F03: codex/core files cannot import from src/ directly.
 * Instead, src/ registers implementations at startup, and codex/core
 * looks them up from this registry.
 *
 * Usage:
 *   // In src/ layer (e.g., src/lib/photonic-retina/index.js):
 *   import { registerPhotonicBridge } from '../../../codex/core/pixelbrain/photonic-bridge-registry.js';
 *   registerPhotonicBridge({ routeRetinaPacketToPhotonicBridge, buildCellSignatures, ... });
 *
 *   // In codex/core layer:
 *   import { getPhotonicBridge } from './photonic-bridge-registry.js';
 *   const bridge = getPhotonicBridge();
 *   bridge.routeRetinaPacketToPhotonicBridge(...);
 *
 * @bytecode SCHOL-PHOTONIC-BRIDGE-REGISTRY
 */

let _bridge = null;

/**
 * Register photonic bridge implementations from the src/ layer.
 * Called once at startup by the photonic-retina module.
 *
 * @param {object} impl - Object with bridge function implementations
 * @param {function} impl.routeRetinaPacketToPhotonicBridge
 * @param {function} impl.buildCellSignatures
 * @param {function} impl.diffCellSignatures
 * @param {function} impl.diffShadowField
 * @param {function} impl.assemblePerceptionFrame
 */
export function registerPhotonicBridge(impl) {
  if (!impl || typeof impl !== 'object') {
    throw new TypeError('registerPhotonicBridge requires an implementation object');
  }
  _bridge = Object.freeze({ ...impl });
}

/**
 * Get the registered photonic bridge implementations.
 * Returns null if not yet registered (src/ layer hasn't initialized).
 *
 * @returns {object|null}
 */
export function getPhotonicBridge() {
  return _bridge;
}

/**
 * Check if the photonic bridge has been registered.
 * @returns {boolean}
 */
export function hasPhotonicBridge() {
  return _bridge !== null;
}
