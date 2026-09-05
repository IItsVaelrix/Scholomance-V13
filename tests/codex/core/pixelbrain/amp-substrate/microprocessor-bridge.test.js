/**
 * Bridge registration (PDR §3.1 F6).
 *
 * Two jobs: prove the new pixelbrain.amp.* ids resolve to the real AMP
 * functions, and prove the pre-existing amp.* ids — a DIFFERENT system that
 * happens to share the word "AMP" — are untouched by adding them.
 */

import { describe, it, expect } from 'vitest';
import { verseIRMicroprocessors, PIXELBRAIN_AMP_IDS } from '../../../../../codex/core/microprocessors/index.js';
import { applyChestplateTemplate } from '../../../../../codex/core/pixelbrain/chestplate-amp.js';
import { applyShieldRimTemplate } from '../../../../../codex/core/pixelbrain/shield-rim-amp.js';
import { applyHolyFireMotif } from '../../../../../codex/core/pixelbrain/holyfire-motif-amp.js';
import { buildGeometryAmpPayload } from '../../../../../codex/core/pixelbrain/geometry-amp.js';
import { applyHeraldryTemplate } from '../../../../../codex/core/pixelbrain/heraldry-amp.js';
import { applySelout } from '../../../../../codex/core/pixelbrain/selout-amp.js';
import { applyFacets } from '../../../../../codex/core/pixelbrain/facet-amp.js';

const PRE_EXISTING_AMP_IDS = [
  'amp.symmetry',
  'amp.coord-symmetry',
  'amp.shadow-perception',
  'amp.turboquant.similarity',
];

describe('PixelBrain AMP substrate bridge', () => {
  it('registers one pixelbrain.amp.* id per item-pipeline AMP', () => {
    expect(PIXELBRAIN_AMP_IDS).toEqual([
      'chestplate-amp', 'facet-amp', 'geometry-amp', 'heraldry-amp', 'holyfire-motif-amp',
      'jewelry-amp', 'noise-fill-amp', 'pixel-aa-amp', 'region-fill-amp', 'sdf-shape-amp',
      'selout-amp', 'shield-rim-amp', 'shield-volume-amp', 'sketch-amp',
      'square-sharpness-contrast-amp', 'symmetry-amp', 'volume-lift-amp',
    ]);
    for (const ampId of PIXELBRAIN_AMP_IDS) {
      expect(verseIRMicroprocessors.has(`pixelbrain.amp.${ampId}`)).toBe(true);
    }
  });

  it('does not squat on the bare amp.* namespace, which already means something else', () => {
    for (const ampId of PIXELBRAIN_AMP_IDS) {
      // The Animation AMP family lives at amp.run/amp.status/etc. Registering
      // e.g. a bare 'amp.chestplate-amp' would deepen that collision.
      expect(verseIRMicroprocessors.has(`amp.${ampId}`)).toBe(false);
    }
  });

  it('leaves every pre-existing amp.* id registered and callable', () => {
    for (const id of PRE_EXISTING_AMP_IDS) {
      expect(verseIRMicroprocessors.has(id)).toBe(true);
    }
  });

  it('adapts a chestplate execution packet to applyChestplateTemplate', async () => {
    // A non-chestplate spec: the AMP's own internal gate returns the template
    // untouched, which is exactly what proves we reached the real function.
    const template = { slots: [], marker: 'untouched' };
    const spec = { class: 'weapon', archetype: 'sword', parts: [] };
    const silhouette = { cells: [], partOf: new Map() };

    const direct = applyChestplateTemplate(template, silhouette, spec, null);
    const viaRegistry = await verseIRMicroprocessors.execute('pixelbrain.amp.chestplate-amp', {
      template,
      silhouette,
      spec,
      constructionHints: null,
    });

    expect(viaRegistry).toBe(direct);
  });

  it('pixelbrain.amp.shield-rim-amp resolves to the real shield-rim entry point', async () => {
    const template = { slots: [], marker: 'untouched' };
    const spec = { class: 'armor', archetype: 'not_a_kite_shield', parts: [] };
    expect(applyShieldRimTemplate(template, { cells: [] }, spec).marker).toBe('untouched');
    expect(verseIRMicroprocessors.has('pixelbrain.amp.shield-rim-amp')).toBe(true);
  });

  it('adapts a holyfire execution packet to applyHolyFireMotif', async () => {
    const silhouette = { cells: [], partOf: new Map() };
    const spec = { class: 'weapon', archetype: 'sword', parts: [{ id: 'blade' }] };
    const direct = applyHolyFireMotif(silhouette, spec);
    const viaRegistry = await verseIRMicroprocessors.execute('pixelbrain.amp.holyfire-motif-amp', {
      silhouette,
      spec,
    });

    expect(viaRegistry).toEqual(direct);
  });

  it('registering the bridge did not collide with any existing id (no overwrite warnings)', () => {
    // factory.js warns via BytecodeError on duplicate registration. Every
    // pixelbrain.amp.* id must be unique against the whole registry.
    const ids = verseIRMicroprocessors.list ? verseIRMicroprocessors.list() : null;
    if (Array.isArray(ids)) {
      const prefixed = ids.filter((id) => id.startsWith('pixelbrain.amp.'));
      expect(new Set(prefixed).size).toBe(prefixed.length);
      expect(prefixed).toHaveLength(PIXELBRAIN_AMP_IDS.length);
    }
  });

  it('every pixelbrain.amp.* id actually invokes its loader and returns a real result, not a function', async () => {
    // This guards against the bug where loaders were `async () => functionRef`
    // instead of `async (...) => functionRef(...)`
    const payloads = {
      'chestplate-amp': { template: {}, silhouette: { cells: [], partOf: new Map() }, spec: { parts: [] }, constructionHints: null },
      'shield-rim-amp': { template: {}, silhouette: { cells: [], partOf: new Map() }, spec: { parts: [] } },
      'shield-volume-amp': { template: {}, silhouette: { cells: [], partOf: new Map() }, spec: { parts: [] } },
      'holyfire-motif-amp': { silhouette: { cells: [], partOf: new Map() }, spec: { parts: [{ id: 'blade' }] } },
      'symmetry-amp': { silhouette: { cells: [], partOf: new Map() }, spec: { parts: [] } },
      'sketch-amp': { occupied: [], dimensions: { w: 10, h: 10 }, options: {} },
      'sdf-shape-amp': { context: {}, options: {} },
      'heraldry-amp': { template: {}, silhouette: { cells: [], partOf: new Map() }, spec: { parts: [] } },
      'jewelry-amp': { template: {}, silhouette: { cells: [], partOf: new Map() }, spec: { parts: [] } },
      'geometry-amp': { spec: { parts: [], canvas: { w: 10, h: 10 } }, silhouette: { cells: [], partOf: new Map() }, construction: {} },
      'region-fill-amp': { silhouette: { cells: [], partOf: new Map() }, template: { coordinates: [] }, spec: { parts: [] }, motifCells: [] },
      'noise-fill-amp': { cellsOrFills: [], noiseDesc: {}, options: {} },
      'selout-amp': { fills: { coordinates: [] }, spec: { parts: [] }, materialResolver: () => ({}), lightOptions: {} },
      'pixel-aa-amp': { fills: { coordinates: [] }, spec: { parts: [] } },
      'facet-amp': { fills: { coordinates: [] }, spec: { parts: [] }, materialResolver: () => ({}), lightOptions: {} },
      'square-sharpness-contrast-amp': { coordinates: [], material: {}, canvas: {}, options: {}, intent: '' },
      'volume-lift-amp': { energized: [], dims: { w: 10, h: 10, d: 10 }, partParams: {} },
    };

    for (const ampId of PIXELBRAIN_AMP_IDS) {
      const payload = payloads[ampId];
      expect(payload).toBeDefined(`Missing test payload for ${ampId}`);
      const result = await verseIRMicroprocessors.execute(`pixelbrain.amp.${ampId}`, payload);
      expect(typeof result).not.toBe('function', `pixelbrain.amp.${ampId} returned a function instead of calling it`);
    }
  });

  it('adapts a geometry-amp execution packet to buildGeometryAmpPayload', async () => {
    const payload = { spec: { parts: [], canvas: { w: 10, h: 10 } }, silhouette: { cells: [], partOf: new Map() }, construction: {} };
    const direct = buildGeometryAmpPayload(payload);
    const viaRegistry = await verseIRMicroprocessors.execute('pixelbrain.amp.geometry-amp', payload);
    expect(viaRegistry).toEqual(direct);
  });

  it('adapts a heraldry-amp execution packet to applyHeraldryTemplate', async () => {
    const template = { slots: [] };
    const silhouette = { cells: [], partOf: new Map() };
    const spec = { class: 'armor', archetype: 'shield', parts: [] };
    const direct = applyHeraldryTemplate(template, silhouette, spec);
    const viaRegistry = await verseIRMicroprocessors.execute('pixelbrain.amp.heraldry-amp', {
      template,
      silhouette,
      spec,
    });
    expect(viaRegistry).toEqual(direct);
  });

  it('adapts a selout-amp execution packet to applySelout', async () => {
    const fills = { coordinates: [] };
    const spec = { class: 'weapon', parts: [] };
    const materialResolver = () => ({});
    const lightOptions = {};
    const direct = applySelout(fills, spec, materialResolver, lightOptions);
    const viaRegistry = await verseIRMicroprocessors.execute('pixelbrain.amp.selout-amp', {
      fills,
      spec,
      materialResolver,
      lightOptions,
    });
    expect(viaRegistry).toEqual(direct);
  });

  it('adapts a facet-amp execution packet to applyFacets', async () => {
    const fills = { coordinates: [] };
    const spec = { class: 'weapon', parts: [] };
    const materialResolver = () => ({});
    const lightOptions = {};
    const direct = applyFacets(fills, spec, materialResolver, lightOptions);
    const viaRegistry = await verseIRMicroprocessors.execute('pixelbrain.amp.facet-amp', {
      fills,
      spec,
      materialResolver,
      lightOptions,
    });
    expect(viaRegistry).toEqual(direct);
  });
});
