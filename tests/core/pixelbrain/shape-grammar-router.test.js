import { describe, expect, it } from 'vitest';

import { forgeArmor } from '../../../codex/core/pixelbrain/factory/armor-factory.js';
import { executeRoute } from '../../../codex/core/pixelbrain/microprocessor-route.js';
import { forgeItemAsset } from '../../../codex/core/pixelbrain/item-foundry.js';
import { normalizeItemSpec } from '../../../codex/core/pixelbrain/item-spec.js';
import { buildVoidChestplateSpec } from '../../../scripts/generate-void-chestplate.mjs';

function routeFor(spec, bundle = forgeItemAsset(spec, { includePng: false })) {
  const { routeDefinition } = forgeArmor(bundle.spec, bundle.construction);
  return {
    routeDefinition,
    context: {
      spec: bundle.spec,
      silhouette: bundle.silhouette,
      fills: { coordinates: bundle.assetPacket.geometry.coordinates },
      geometry: bundle.geometry,
      construction: bundle.construction,
    },
  };
}

describe('PixelBrain deterministic shape grammar router', () => {
  it('routes the canonical VOID chestplate through seam-owned required outputs', () => {
    const bundle = forgeItemAsset(buildVoidChestplateSpec(), { includePng: false });

    expect(bundle.expansion).toMatchObject({
      contract: 'PB-SHAPE-GRAMMAR-v1',
      grammarId: 'armor.chestplate.sovereign-v1',
    });
    expect(bundle.construction.skeleton).toMatchObject({
      contract: 'PB-CONSTRUCTION-SKELETON-v1',
    });
    expect(bundle.geometry.masks.center_core.length).toBeGreaterThan(0);
    expect(bundle.routeDiagnostics.ok).toBe(true);
    expect(bundle.routeDiagnostics.failures).toEqual([]);
  });

  it('fails loudly when a mirrored required material resolves null', () => {
    const spec = buildVoidChestplateSpec();
    const bundle = forgeItemAsset(spec, { includePng: false });
    const brokenSpec = {
      ...bundle.spec,
      parts: bundle.spec.parts.map((part) => (
        part.id === 'right_pauldron'
          ? { id: 'right_pauldron', profile: 'armor.pauldron.void_reference_human', attach: { parent: 'body', at: 'rightShoulder' } }
          : part
      )),
    };
    const { routeDefinition, context } = routeFor(spec, bundle);
    const result = executeRoute(routeDefinition, { ...context, spec: brokenSpec });

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PB_ROUTE_REQUIRED_MATERIAL_NULL',
          requiredOutput: 'right_pauldron-fill',
          step: 'RegionFillAMP',
        }),
      ]),
    );
  });

  it('fails loudly when required heraldry stamps zero cells', () => {
    const spec = buildVoidChestplateSpec();
    const bundle = forgeItemAsset(spec, { includePng: false });
    const { routeDefinition, context } = routeFor(spec, bundle);
    const withoutEmblem = bundle.assetPacket.geometry.coordinates.filter((cell) => cell.partId !== 'emblem');
    const result = executeRoute(routeDefinition, {
      ...context,
      fills: { coordinates: withoutEmblem },
    });

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PB_ROUTE_REQUIRED_OUTPUT_EMPTY',
          requiredOutput: 'emblem-cells',
          step: 'HeraldryAMP',
          seam: 'heraldry-template-v1',
        }),
      ]),
    );
  });

  it('fails strict symmetry when only one pauldron reaches the final lattice', () => {
    const spec = buildVoidChestplateSpec();
    const bundle = forgeItemAsset(spec, { includePng: false });
    const { routeDefinition, context } = routeFor(spec, bundle);
    const oneSided = bundle.assetPacket.geometry.coordinates.filter((cell) => cell.partId !== 'right_pauldron');
    const result = executeRoute(routeDefinition, {
      ...context,
      fills: { coordinates: oneSided },
    });

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PB_ROUTE_REQUIRED_OUTPUT_EMPTY',
          requiredOutput: 'right_pauldron-cells',
        }),
      ]),
    );
  });

  it('fails when a required shader target has no GeometryAMP mask', () => {
    const spec = buildVoidChestplateSpec();
    const bundle = forgeItemAsset(spec, { includePng: false });
    const { routeDefinition, context } = routeFor(spec, bundle);
    const { center_core: _centerCore, ...masks } = bundle.geometry.masks;
    const result = executeRoute(routeDefinition, {
      ...context,
      geometry: { ...bundle.geometry, masks },
    });

    expect(result.diagnostics.ok).toBe(false);
    expect(result.diagnostics.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PB_ROUTE_REQUIRED_OUTPUT_EMPTY',
          requiredOutput: 'center_core-shader-mask',
          step: 'GeometryAMP',
          seam: 'geometry-mask-v1',
        }),
      ]),
    );
  });

  it('allows optional zero-cell heraldry decoration without route failure', () => {
    const rawSpec = buildVoidChestplateSpec();
    rawSpec.heraldry = rawSpec.heraldry.map((entry) => ({
      ...entry,
      required: false,
      placement: { originX: -1000, originY: -1000 },
    }));
    const spec = normalizeItemSpec(rawSpec);
    const { routeDefinition } = forgeArmor(spec, null);

    expect(routeDefinition.requiredOutputs.some((req) => req.kind === 'heraldryCells')).toBe(false);
  });
});
