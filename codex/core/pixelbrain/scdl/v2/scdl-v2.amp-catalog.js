/**
 * Central Catalog and Registry for SCDL v2 Universal AMP Substrate.
 *
 * Tracks all registered PB-AMP-ABI-v1 manifests and their associated
 * execution adapters.
 */

import { validateAmpAbiManifest, computeAmpAbiChecksum } from './scdl-v2.amp-abi.js';
import { ANCHOR_MANIFESTS } from './amp-manifests/index.js';

import FacetAdapter from './adapters/facet.adapter.js';
import PixelAAAdapter from './adapters/pixel-aa.adapter.js';
import ImageSegmentationAdapter from './adapters/image-segmentation.adapter.js';
import GearGlideAdapter from './adapters/gear-glide.adapter.js';
import NoiseFillAdapter from './adapters/noise-fill.adapter.js';

class AmpCatalog {
  constructor() {
    this.manifests = new Map();
    this.adapters = new Map();
    this.checksums = new Map();
  }

  /**
   * Registers a PB-AMP-ABI-v1 manifest.
   * Throws if the manifest is invalid.
   */
  registerManifest(manifest) {
    const val = validateAmpAbiManifest(manifest);
    if (!val.ok) {
      throw new Error(`Cannot register invalid manifest for '${manifest?.ampId}': ${val.errors.join('; ')}`);
    }

    const checksum = computeAmpAbiChecksum(manifest);
    const frozen = Object.freeze({ ...manifest, checksum });
    this.manifests.set(manifest.ampId, frozen);
    this.checksums.set(manifest.ampId, checksum);
    return frozen;
  }

  getManifest(ampId) {
    return this.manifests.get(ampId) || null;
  }

  hasManifest(ampId) {
    return this.manifests.has(ampId);
  }

  listManifests() {
    return Object.freeze([...this.manifests.values()]);
  }

  /**
   * Registers an execution adapter for an AMP.
   * An adapter must implement:
   * - execute(inputs, params, context) -> output
   */
  registerAdapter(ampId, adapter) {
    if (!adapter || typeof adapter.execute !== 'function') {
      throw new Error(`Adapter for '${ampId}' must provide an execute() method.`);
    }
    this.adapters.set(ampId, Object.freeze(adapter));
  }

  getAdapter(ampId) {
    return this.adapters.get(ampId) || null;
  }

  hasAdapter(ampId) {
    return this.adapters.has(ampId);
  }

  clear() {
    this.manifests.clear();
    this.adapters.clear();
    this.checksums.clear();
  }

  loadManifestsFromDir(dirPath) {
    // In browser bundles, directory scanning is unsupported.
    // Anchor manifests are statically pre-registered in initAnchorAmps.
    return [];
  }

  initAnchorAmps() {
    for (const manifest of ANCHOR_MANIFESTS) {
      this.registerManifest(manifest);
    }
    this.registerAdapter('pixelbrain.facet', FacetAdapter);
    this.registerAdapter('pixelbrain.pixel-aa', PixelAAAdapter);
    this.registerAdapter('pixelbrain.image-segmentation', ImageSegmentationAdapter);
    this.registerAdapter('pixelbrain.gear-glide', GearGlideAdapter);
    this.registerAdapter('pixelbrain.noise-fill', NoiseFillAdapter);
  }
}

export const globalAmpCatalog = new AmpCatalog();
globalAmpCatalog.initAnchorAmps();

export function registerAmpManifest(manifest) {
  return globalAmpCatalog.registerManifest(manifest);
}

export function getAmpManifest(ampId) {
  return globalAmpCatalog.getManifest(ampId);
}

export function listAmpManifests() {
  return globalAmpCatalog.listManifests();
}

export function registerAmpAdapter(ampId, adapter) {
  return globalAmpCatalog.registerAdapter(ampId, adapter);
}

export function getAmpAdapter(ampId) {
  return globalAmpCatalog.getAdapter(ampId);
}
