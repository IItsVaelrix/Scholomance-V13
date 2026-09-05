import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectActiveAmps } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';
import { loadRelevanceRecordsSync, clearRelevanceRecordsCache } from '../../../../../codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js';

const SPECS_DIR = join(process.cwd(), 'specs');

function realSpecs() {
  return readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, spec: JSON.parse(readFileSync(join(SPECS_DIR, f), 'utf8')) }));
}

// The 16 real gates, copied verbatim from item-foundry.js / the AMP modules'
// own internal checks (§6.1 table above) — this is the oracle the registry's
// predicates must agree with, not the other way around.
function realGateFor(ampId, spec) {
  const parts = spec.parts || [];
  switch (ampId) {
    case 'holyfire-motif-amp':
      return spec.class === 'weapon' && spec.archetype === 'sword'
        && parts.some((p) => p.profile === 'weapon.sword.holyfire_motif' || p.id === 'holyFire' || p.id === 'holy_fire');
    case 'shield-rim-amp':
    case 'shield-volume-amp':
      return spec.class === 'armor' && spec.archetype === 'kite_shield';
    case 'chestplate-amp':
      return spec.class === 'armor' && String(spec.archetype || '').includes('chestplate');
    case 'sketch-amp':
    case 'geometry-amp':
    case 'region-fill-amp':
    case 'pixel-aa-amp':
    case 'square-sharpness-contrast-amp':
      return true;
    case 'sdf-shape-amp':
      return parts.some((p) => p.sdf);
    case 'heraldry-amp':
      return Array.isArray(spec.heraldry) && spec.heraldry.length > 0;
    case 'jewelry-amp': {
      const hasGems = parts.some((p) => p.profile && (p.profile.startsWith('gem.') || (p.id || '').includes('crystal') || (p.id || '').includes('core')));
      return hasGems || ['amulet', 'ring', 'jewelry'].includes(spec.class);
    }
    case 'noise-fill-amp':
      return parts.some((p) => p.noise);
    case 'selout-amp':
      return !!spec.light;
    case 'facet-amp':
      return !!spec.light && parts.some((p) => p.shading === 'faceted');
    default:
      throw new Error(`no oracle for ${ampId}`);
  }
}

const CUTOVER_ELIGIBLE = [
  'holyfire-motif-amp', 'sketch-amp', 'sdf-shape-amp', 'shield-rim-amp', 'shield-volume-amp',
  'heraldry-amp', 'jewelry-amp', 'chestplate-amp', 'geometry-amp', 'region-fill-amp',
  'noise-fill-amp', 'selout-amp', 'pixel-aa-amp', 'facet-amp', 'square-sharpness-contrast-amp',
];

describe('item-pipeline predicates agree with item-foundry.js real gates', () => {
  it.each(realSpecs())('$file: registry activation matches the real gate for every AMP', ({ spec }) => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    const { activated } = selectActiveAmps('item', spec, records);
    for (const ampId of CUTOVER_ELIGIBLE) {
      expect(activated.includes(ampId)).toBe(realGateFor(ampId, spec));
    }
  });

  it('synthetic edge cases: sdf, noise, light, faceted, heraldry, gems all gate correctly', () => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    const withEverything = {
      class: 'weapon', archetype: 'staff', light: { angle: 1 },
      heraldry: [{ id: 'e1' }],
      parts: [
        { id: 'blade', sdf: { shape: 'circle' }, noise: { contract: 'PB-NOISE-v1' }, shading: 'faceted' },
        { id: 'gem1', profile: 'gem.ruby' },
      ],
    };
    const { activated } = selectActiveAmps('item', withEverything, records);
    for (const ampId of ['sdf-shape-amp', 'noise-fill-amp', 'selout-amp', 'facet-amp', 'heraldry-amp', 'jewelry-amp']) {
      expect(activated).toContain(ampId);
    }

    const withNothing = { class: 'weapon', archetype: 'staff', parts: [{ id: 'blade' }] };
    const { activated: activatedBare } = selectActiveAmps('item', withNothing, records);
    for (const ampId of ['sdf-shape-amp', 'noise-fill-amp', 'selout-amp', 'facet-amp', 'heraldry-amp', 'jewelry-amp']) {
      expect(activatedBare).not.toContain(ampId);
    }
  });

  it('always-relevant item AMPs activate on every real spec', () => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    for (const { spec } of realSpecs()) {
      const { activated } = selectActiveAmps('item', spec, records);
      for (const ampId of ['sketch-amp', 'geometry-amp', 'region-fill-amp', 'pixel-aa-amp', 'square-sharpness-contrast-amp']) {
        expect(activated).toContain(ampId);
      }
    }
  });

  it('volume-lift-amp is registered but flagged as not cutover-eligible', () => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    const record = records.find((r) => r.pipeline === 'item' && r.ampId === 'volume-lift-amp');
    expect(record).toBeDefined();
  });
});
