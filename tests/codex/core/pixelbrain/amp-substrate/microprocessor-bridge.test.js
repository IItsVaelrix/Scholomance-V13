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

const PRE_EXISTING_AMP_IDS = [
  'amp.symmetry',
  'amp.coord-symmetry',
  'amp.shadow-perception',
  'amp.turboquant.similarity',
];

describe('PixelBrain AMP substrate bridge', () => {
  it('registers one pixelbrain.amp.* id per pilot AMP', () => {
    expect(PIXELBRAIN_AMP_IDS).toEqual([
      'chestplate-amp', 'holyfire-motif-amp', 'shield-rim-amp', 'shield-volume-amp', 'symmetry-amp',
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
});
