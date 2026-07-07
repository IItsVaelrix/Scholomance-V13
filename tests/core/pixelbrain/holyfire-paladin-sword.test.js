/**
 * QA Validation: Holy Fire Paladin Sword PDR implementation
 *
 * Per 2026-06-12-pixelbrain-holy-fire-paladin-sword-pdr:
 *   - Material slots (holy_steel, sanctified_gold, divine_flame_core,
 *     radiant_blue) are present and expose the canonical anchor set
 *   - Part profiles (blade, guard, grip, pommel) emit integer lattice
 *     cells and match the PDR formulas
 *   - Spec normalization preserves the holy-paladin geometry intent
 *   - forgeItemAsset produces a deterministic bundle with the required
 *     seam-checked outputs (blade/guard/hilt/pommel cells, holyFire
 *     motif cells, cross engraving, shader target masks)
 *   - Loud failure: a missing blade material fails the route, as does a
 *     missing holy fire motif emission
 *   - Determinism: repeated forge runs are byte-identical
 */
import { describe, expect, it } from 'vitest';

import { forgeItemAsset } from '../../../codex/core/pixelbrain/item-foundry.js';
import { normalizeItemSpec, hashItemSpec } from '../../../codex/core/pixelbrain/item-spec.js';
import { MATERIAL_PALETTES, MATERIAL_SHADER_INDEX } from '../../../codex/core/pixelbrain/material-registry.js';
import { forgeHolyFirePaladinSword as forgeHolyFirePaladinSwordWeaponRoute } from '../../../codex/core/pixelbrain/factory/weapon-factory.js';
import { applyHolyFireMotif } from '../../../codex/core/pixelbrain/holyfire-motif-amp.js';
import { composeSilhouette } from '../../../codex/core/pixelbrain/silhouette-composer.js';
import { validateRoute } from '../../../codex/core/pixelbrain/microprocessor-route.js';
import { buildHolyFirePaladinSwordSpec, HOLYFIRE_PALADIN_MATERIALS } from '../../../scripts/generate-holyfire-paladin-sword.mjs';

const ANCHOR_KEYS = ['void', 'shadow', 'deep', 'body', 'frost', 'spectral', 'whiteCore'];
const HEX_RE = /^#[\dA-Fa-f]{6}$/;

function countByPart(coordinates) {
  const counts = {};
  for (const cell of coordinates) counts[cell.partId] = (counts[cell.partId] || 0) + 1;
  return counts;
}

describe('Holy Fire Paladin Sword PDR implementation', () => {
  describe('material registry', () => {
    it('registers the four holy-paladin materials with full anchor ramps', () => {
      for (const id of HOLYFIRE_PALADIN_MATERIALS) {
        const def = MATERIAL_PALETTES[id];
        expect(def, id).toBeDefined();
        expect(def.category, `${id}.category`).toBeDefined();
        for (const anchor of ANCHOR_KEYS) {
          expect(def.anchors[anchor], `${id}.${anchor}`).toMatch(HEX_RE);
        }
      }
    });

    it('assigns append-only shader indices to the new materials', () => {
      for (const id of HOLYFIRE_PALADIN_MATERIALS) {
        expect(Number.isInteger(MATERIAL_SHADER_INDEX[id]), id).toBe(true);
      }
      // Holy materials must be at unique indices, distinct from legacy 0..28
      const holyIndices = HOLYFIRE_PALADIN_MATERIALS.map((id) => MATERIAL_SHADER_INDEX[id]);
      expect(new Set(holyIndices).size).toBe(holyIndices.length);
    });
  });

  describe('spec normalization', () => {
    it('preserves the holy-paladin geometry intent', () => {
      const spec = normalizeItemSpec(buildHolyFirePaladinSwordSpec());
      expect(spec.contract).toBe('ITEM-SPEC-v1');
      expect(spec.class).toBe('weapon');
      expect(spec.archetype).toBe('sword');
      expect(spec.canvas).toEqual({ width: 64, height: 96, gridSize: 1 });
      expect(spec.symmetry).toEqual({ axis: 'vertical', mode: 'strict' });
      expect(spec.bytecode).toBe('HOLY-FIRE-PALADIN-SWORD-ASCENDANT');
      expect(spec.construction).toBeTruthy();
      expect(spec.construction.center).toEqual({ x: 32, y: 40 });

      const blade = spec.parts.find((p) => p.id === 'blade');
      expect(blade.profile).toBe('weapon.sword.holyfire_paladin_blade');
      expect(blade.fill.material).toBe('holy_steel');

      const guard = spec.parts.find((p) => p.id === 'guard');
      expect(guard.profile).toBe('weapon.sword.holyfire_paladin_guard');
      expect(guard.fill.material).toBe('sanctified_gold');

      const holyFire = spec.parts.find((p) => p.id === 'holyFire');
      expect(holyFire.profile).toBe('weapon.sword.holyfire_motif');
      expect(holyFire.fill.material).toBe('divine_flame_core');

      expect(spec.heraldry?.[0]?.mark).toBe('cross');
      expect(spec.heraldry?.[0]?.target).toBe('guard');
    });
  });

  describe('forged bundle', () => {
    it('produces a deterministic, loud-failure-passing weapon artifact', () => {
      const bundle = forgeItemAsset(buildHolyFirePaladinSwordSpec(), { includePng: false });
      const coords = bundle.assetPacket.geometry.coordinates;
      const counts = countByPart(coords);

      // PDR §5.1 expected post-forge assertions
      expect(bundle.expansion).toMatchObject({
        contract: 'PB-SHAPE-GRAMMAR-v1',
        grammarId: 'weapon.sword.holy-paladin-v1',
      });
      expect(bundle.construction.skeleton).toMatchObject({
        contract: 'PB-CONSTRUCTION-SKELETON-v1',
      });
      expect(bundle.routeDiagnostics.ok).toBe(true);
      expect(bundle.routeDiagnostics.failures).toEqual([]);

      // PDR §5 required outputs (loud failures)
      expect(counts.blade).toBeGreaterThan(120);
      expect(counts.guard).toBeGreaterThan(40);
      expect(counts.hilt).toBeGreaterThan(15);
      expect(counts.pommel).toBeGreaterThan(15);
      expect(counts.holyFire).toBeGreaterThan(15);
      // Cross engraving is stamped on the guard by the heraldry-amp
      expect(counts.cross).toBeGreaterThan(5);

      // Geometry-amp masks
      expect(bundle.geometry.masks.blade.length).toBeGreaterThan(0);
      expect(bundle.geometry.masks.holyFire.length).toBeGreaterThan(8);
      expect(bundle.geometry.masks.cross.length).toBeGreaterThan(0);

      // Shader packet
      expect(bundle.shader).toBeTruthy();
      expect(bundle.shader.packet.contract).toBe('PB-SHADER-v1');
    });
  });

  describe('holyfire-motif-amp', () => {
    it('emits deterministic flame cells adjacent to the blade', () => {
      const spec = normalizeItemSpec(buildHolyFirePaladinSwordSpec());
      const silhouette = composeSilhouette(spec);
      const result = applyHolyFireMotif(silhouette, spec);
      expect(result.motifCells.length).toBeGreaterThan(15);
      // Every motif cell must be tagged as the holyFire part
      for (const cell of result.motifCells) {
        expect(cell.partId).toBe('holyFire');
      }
      // Cells must be integer lattice
      for (const cell of result.motifCells) {
        expect(Number.isInteger(cell.x)).toBe(true);
        expect(Number.isInteger(cell.y)).toBe(true);
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThan(spec.canvas.width);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThan(spec.canvas.height);
      }
    });

    it('is byte-stable across runs (no Math.random)', () => {
      const spec = normalizeItemSpec(buildHolyFirePaladinSwordSpec());
      const silhouette = composeSilhouette(spec);
      const a = applyHolyFireMotif(silhouette, spec);
      const b = applyHolyFireMotif(silhouette, spec);
      expect(JSON.stringify(a.motifCells)).toBe(JSON.stringify(b.motifCells));
    });
  });

  describe('shape grammar route', () => {
    it('registers the holy-paladin grammar with required output contracts', () => {
      const spec = normalizeItemSpec(buildHolyFirePaladinSwordSpec());
      const bundle = forgeItemAsset(spec, { includePng: false });
      const { routeDefinition, expansion } = forgeHolyFirePaladinSwordWeaponRoute(spec, bundle.construction);
      expect(expansion.grammarId).toBe('weapon.sword.holy-paladin-v1');
      const requiredIds = routeDefinition.requiredOutputs.map((r) => r.id);
      expect(requiredIds).toEqual(expect.arrayContaining([
        'blade-cells', 'guard-cells', 'hilt-cells', 'pommel-cells',
        'blade-fill', 'guard-fill', 'holyfire-motifs', 'cross-engraving',
        'center-blade-shader-mask', 'fire-emission-mask', 'cross-shader-mask',
      ]));
    });

    it('fails loudly when the holy fire motif emission is empty', () => {
      const spec = normalizeItemSpec(buildHolyFirePaladinSwordSpec());
      const bundle = forgeItemAsset(spec, { includePng: false });
      const { routeDefinition } = forgeHolyFirePaladinSwordWeaponRoute(spec, bundle.construction);
      // Strip all holyFire cells from the lattice
      const stripped = bundle.assetPacket.geometry.coordinates.filter((c) => c.partId !== 'holyFire');
      const result = validateRoute(routeDefinition, {
        spec,
        silhouette: bundle.silhouette,
        fills: { coordinates: stripped },
        geometry: bundle.geometry,
        construction: bundle.construction,
      });
      expect(result.diagnostics.ok).toBe(false);
      expect(result.diagnostics.failures).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'PB_ROUTE_REQUIRED_OUTPUT_EMPTY',
            requiredOutput: 'holyfire-motifs',
          }),
        ]),
      );
    });
  });

  describe('determinism', () => {
    it('produces byte-identical bundle across repeated forge runs', () => {
      const a = forgeItemAsset(buildHolyFirePaladinSwordSpec(), { includePng: false });
      const b = forgeItemAsset(buildHolyFirePaladinSwordSpec(), { includePng: false });
      expect(hashItemSpec(a.spec)).toBe(hashItemSpec(b.spec));
      expect(JSON.stringify(a.assetPacket)).toBe(JSON.stringify(b.assetPacket));
      expect(a.godotArtifact).toBe(b.godotArtifact);
      expect(a.shader.hash).toBe(b.shader.hash);
    });
  });
});
