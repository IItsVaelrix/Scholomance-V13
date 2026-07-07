/**
 * Weapon Factory
 * Declares the microprocessor route for weapons (e.g. Holy Fire Paladin
 * Sword), per 2026-06-12-pixelbrain-holy-fire-paladin-sword-pdr.
 *
 * Mirrors the seam-checked route pattern used in armor-factory.js, but
 * with weapon-specific required outputs (blade, guard, hilt, pommel,
 * holyFire motif, cross engraving, shader target masks).
 */
import { executeRoute } from '../microprocessor-route.js';
import { expandShapeGrammar } from '../shape-grammar-engine.js';
import { HOLYFIRE_MOTIF_AMP_SEAM } from '../holyfire-motif-amp.js';
import { SDF_SHAPE_AMP_SEAM } from '../sdf-shape-amp.js';
import { NOISE_FILL_AMP_SEAM } from '../noise-fill-amp.js';
import { createVolumeLiftStep } from '../volume-lift-amp.js';

const holyPaladinGrammar = {
  id: 'weapon.sword.holy-paladin-v1',
  version: '1.0.0',
  expand: (ctx) => {
    // Add every declared part to the manifest
    for (const part of ctx.spec.parts) {
      ctx.addPart(part);
    }

    // Required part cells (loud failures when minimums are not met)
    ctx.requireOutput({ id: 'blade-cells', kind: 'partCells', selector: 'blade', minCells: 120, fatal: true });
    ctx.requireOutput({ id: 'guard-cells', kind: 'partCells', selector: 'guard', minCells: 40, fatal: true });
    ctx.requireOutput({ id: 'hilt-cells', kind: 'partCells', selector: 'hilt', minCells: 15, fatal: true });
    ctx.requireOutput({ id: 'pommel-cells', kind: 'partCells', selector: 'pommel', minCells: 15, fatal: true });

    // Required material slots
    ctx.requireOutput({ id: 'blade-fill', kind: 'materialSlot', selector: 'blade.fill', fatal: true });
    ctx.requireOutput({ id: 'guard-fill', kind: 'materialSlot', selector: 'guard.fill', fatal: true });

    // Holy fire motif emission (the holyfire-motif-amp's output)
    // Note: With canvas 64x96 and blade y=8..72, only ~8 rows exist above
    // the blade for flames. The amp fans 3 plumes from the tip; minCells
    // reflects the realistic emission envelope for this geometry.
    const holyFireId = (ctx.spec.parts.find((p) => p.id === 'holyFire' || p.id === 'holy_fire'))?.id || 'holyFire';
    ctx.requireOutput({ id: 'holyfire-motifs', kind: 'motifCells', selector: holyFireId, minCells: 15, fatal: true });

    // Cross engraving (uses the heraldry amp's `cross` mark on the guard)
    if (Array.isArray(ctx.spec.heraldry) && ctx.spec.heraldry.some((h) => h.mark === 'cross')) {
      ctx.requireOutput({ id: 'cross-engraving', kind: 'heraldryCells', selector: 'cross', minCells: 5, fatal: true });
    }

    // Shader target masks (the GeometryAMP must emit masks for these)
    ctx.requireOutput({ id: 'center-blade-shader-mask', kind: 'shaderMask', selector: 'blade', minCells: 1, fatal: true });
    ctx.requireOutput({ id: 'fire-emission-mask', kind: 'shaderMask', selector: holyFireId, minCells: 8, fatal: true });
    ctx.requireOutput({ id: 'cross-shader-mask', kind: 'shaderMask', selector: 'cross', minCells: 1, fatal: true });
  },
};

const pickaxeGrammar = {
  id: 'weapon.tool.pickaxe-v1',
  version: '1.0.0',
  expand: (ctx) => {
    for (const part of ctx.spec.parts) ctx.addPart(part);

    ctx.requireOutput({ id: 'pickaxe-head-cells', kind: 'partCells', selector: 'head_core', minCells: 120, fatal: true });
    ctx.requireOutput({ id: 'pickaxe-handle-cells', kind: 'partCells', selector: 'handle', minCells: 70, fatal: true });
    ctx.requireOutput({ id: 'pickaxe-wrap-cells', kind: 'partCells', selector: 'handle_wrap', minCells: 8, fatal: true });
    ctx.requireOutput({ id: 'pickaxe-collar-cells', kind: 'partCells', selector: 'collar', minCells: 20, fatal: true });
    ctx.requireOutput({ id: 'pickaxe-inlay-cells', kind: 'partCells', selector: 'void_inlay', minCells: 8, fatal: true });

    ctx.requireOutput({ id: 'pickaxe-head-fill', kind: 'materialSlot', selector: 'head_core.fill', fatal: true });
    ctx.requireOutput({ id: 'pickaxe-handle-fill', kind: 'materialSlot', selector: 'handle.fill', fatal: true });
    ctx.requireOutput({ id: 'pickaxe-wrap-fill', kind: 'materialSlot', selector: 'handle_wrap.fill', fatal: true });
    ctx.requireOutput({ id: 'pickaxe-collar-fill', kind: 'materialSlot', selector: 'collar.fill', fatal: true });
    ctx.requireOutput({ id: 'pickaxe-inlay-fill', kind: 'materialSlot', selector: 'void_inlay.fill', fatal: true });
  },
};

function requiredStepForPickaxe(req, spec) {
  if (req.kind === 'shaderMask') return 'GeometryAMP';
  if (req.kind === 'materialSlot') return 'RegionFillAMP';
  if (req.kind === 'partCells') {
    const part = spec.parts.find((p) => p.id === req.selector);
    return (part && part.sdf) ? 'SDFShapeAMP' : 'SilhouetteComposer';
  }
  return 'SilhouetteComposer';
}

function requiredSeamForPickaxe(req, spec) {
  if (req.kind === 'shaderMask') return 'geometry-mask-v1';
  if (req.kind === 'materialSlot') return 'region-fill-v1';
  if (req.kind === 'partCells') {
    const part = spec.parts.find((p) => p.id === req.selector);
    return (part && part.sdf) ? 'sdf-shape-v1' : 'silhouette-v1';
  }
  return 'silhouette-v1';
}

export function forgeWeapon(spec, skeleton) {
  if (spec.archetype === 'pickaxe') {
    const expansion = expandShapeGrammar(spec, skeleton, pickaxeGrammar);
    const routeDefinition = {
      name: 'weapon.tool.pickaxe-v1',
      requiredOutputs: expansion.requiredOutputs,
      requiredOutputSteps: Object.fromEntries(expansion.requiredOutputs.map((req) => [req.id, requiredStepForPickaxe(req, spec)])),
      requiredOutputSeams: Object.fromEntries(expansion.requiredOutputs.map((req) => [req.id, requiredSeamForPickaxe(req, spec)])),
      steps: [
        {
          name: 'SilhouetteComposer',
          seam: {
            id: 'silhouette-v1', processor: 'pixelbrain.silhouette', version: '1.0.0',
            consumes: ['spec.parts'],
            emits: [
              'silhouette.cells',
              'silhouette.partOf',
              ...spec.parts.map((part) => 'part.' + part.id + '.cells'),
            ],
          },
          execute: () => {},
        },
        {
          name: 'ShapeGrammarExpansion',
          seam: {
            id: 'shape-grammar-v1', processor: 'pixelbrain.shapeGrammar', version: '1.0.0',
            consumes: ['spec.parts', 'silhouette.cells'],
            emits: ['shape.parts', 'shape.requiredOutputs', 'shape.seams'],
          },
          execute: () => {},
        },
        {
          name: 'RegionFillAMP',
          seam: {
            id: 'region-fill-v1', processor: 'pixelbrain.regionFill', version: '1.0.0',
            consumes: ['template.coordinates', 'silhouette.partOf', 'spec.parts'],
            emits: [
              'fills.coordinates',
              ...spec.parts.flatMap((part) => [
                'material.' + part.id + '.fill',
                'material.' + part.id + '.trim',
                'material.' + part.id + '.outline',
              ]),
            ],
          },
          execute: () => {},
        },
        {
          name: 'GeometryAMP',
          seam: {
            id: 'geometry-mask-v1', processor: 'pixelbrain.geometry', version: '1.0.0',
            consumes: ['fills.coordinates', 'silhouette.partOf'],
            emits: [
              'geometry.masks',
              ...spec.parts.map((part) => 'geometry.mask.' + part.id),
            ],
          },
          execute: () => {},
        },
        createVolumeLiftStep({
          dims: { width: spec.canvas.width, height: spec.canvas.height },
          partParams: (spec.parts || []).reduce((acc, part) => {
            const vol = part.volume || {};
            acc[part.id] = {
              profile: vol.profile || 'flat',
              maxDepth: Number.isFinite(vol.maxDepth) ? vol.maxDepth : 1,
              steps: vol.steps,
            };
            return acc;
          }, {}),
        }),
      ],
    };
    return { routeDefinition, expansion };
  }

  if (spec.archetype === 'sword' && spec.parts.some((p) => p.profile === 'weapon.sword.holyfire_paladin_blade')) {
    // 1. Shape Grammar Expansion
    const expansion = expandShapeGrammar(spec, skeleton, holyPaladinGrammar);

  // 2. Define the route (seam-checked steps)
  const routeDefinition = {
    name: 'weapon.sword.holy-paladin-v1',
    requiredOutputs: expansion.requiredOutputs,
    requiredOutputSteps: Object.fromEntries(expansion.requiredOutputs.map((req) => {
      if (req.kind === 'heraldryCells') return [req.id, 'HeraldryAMP'];
      if (req.kind === 'motifCells') return [req.id, 'HolyFireMotifAMP'];
      if (req.kind === 'shaderMask') return [req.id, 'GeometryAMP'];
      if (req.kind === 'materialSlot') return [req.id, 'RegionFillAMP'];
      if (req.kind === 'partCells') {
        const part = spec.parts.find(p => p.id === req.selector);
        return [req.id, (part && part.sdf) ? 'SDFShapeAMP' : 'SilhouetteComposer'];
      }
      return [req.id, 'SilhouetteComposer'];
    })),
    requiredOutputSeams: Object.fromEntries(expansion.requiredOutputs.map((req) => {
      if (req.kind === 'heraldryCells') return [req.id, 'heraldry-template-v1'];
      if (req.kind === 'motifCells') return [req.id, 'holyfire-motif-v1'];
      if (req.kind === 'shaderMask') return [req.id, 'geometry-mask-v1'];
      if (req.kind === 'materialSlot') return [req.id, 'region-fill-v1'];
      if (req.kind === 'partCells') {
        const part = spec.parts.find(p => p.id === req.selector);
        return [req.id, (part && part.sdf) ? 'sdf-shape-v1' : 'silhouette-v1'];
      }
      return [req.id, 'silhouette-v1'];
    })),
    steps: [
      {
        name: 'SilhouetteComposer',
        seam: {
          id: 'silhouette-v1', processor: 'pixelbrain.silhouette', version: '1.0.0',
          consumes: ['spec.parts'],
          emits: [
            'silhouette.cells',
            'silhouette.partOf',
            ...spec.parts.map((part) => `part.${part.id}.cells`),
          ],
        },
        execute: () => {},
      },
      {
        name: 'ConstructionAMP',
        seam: {
          id: 'construction-skeleton-v1', processor: 'pixelbrain.construction', version: '1.0.0',
          consumes: ['spec.construction', 'silhouette.cells'],
          emits: ['construction.skeleton', 'construction.anchors'],
        },
        execute: () => {},
      },
      // SDFShapeAMP is applied in foundry if spec.parts have 'sdf'; not added here to avoid breaking holy tests that don't declare it.

      {
        name: 'ShapeGrammarExpansion',
        seam: {
          id: 'shape-grammar-v1', processor: 'pixelbrain.shapeGrammar', version: '1.0.0',
          consumes: ['spec.parts', 'construction.skeleton'],
          emits: ['shape.parts', 'shape.requiredOutputs', 'shape.seams'],
        },
        execute: () => {},
      },
      {
        name: 'HolyFireMotifAMP',
        seam: {
          ...HOLYFIRE_MOTIF_AMP_SEAM,
          id: 'holyfire-motif-v1',
        },
        execute: () => {},
      },
      {
        name: 'HeraldryAMP',
        seam: {
          id: 'heraldry-template-v1', processor: 'pixelbrain.heraldry', version: '0.3.0',
          consumes: ['template.coordinates', 'silhouette.partOf', 'spec.heraldry', 'construction.anchors'],
          emits: ['heraldry.cells', 'template.coordinates.heraldry'],
          mutates: ['silhouette.partOf'],
          mergeContract: 'heraldry-stamp-after-holyfire-flames-v1',
          validates: ['cross.cells > 0 when required'],
        },
        execute: () => {},
      },
      {
        name: 'RegionFillAMP',
        seam: {
          id: 'region-fill-v1', processor: 'pixelbrain.regionFill', version: '1.0.0',
          consumes: ['template.coordinates', 'silhouette.partOf', 'spec.parts'],
          emits: [
            'fills.coordinates',
            ...spec.parts.flatMap((part) => [
              `material.${part.id}.fill`,
              `material.${part.id}.trim`,
              `material.${part.id}.outline`,
            ]),
          ],
        },
        execute: () => {},
      },
      // NoiseFillAMP is applied in foundry if spec.parts have 'noise'; not added to this holy route to preserve existing test expectations for seam/required failures.

      {
        name: 'GeometryAMP',
        seam: {
          id: 'geometry-mask-v1', processor: 'pixelbrain.geometry', version: '1.0.0',
          consumes: ['fills.coordinates', 'silhouette.partOf'],
          emits: [
            'geometry.masks',
            ...spec.parts.map((part) => `geometry.mask.${part.id}`),
          ],
          validates: ['shader target masks exist before shader forge'],
        },
        execute: () => {},
      },
    ],
  };

    return { routeDefinition, expansion };
  }

  // Fallback for other weapons
  return {
    routeDefinition: {
      name: `weapon.${spec.archetype || 'generic'}`,
      requiredOutputs: [],
      steps: []
    },
    expansion: null
  };
}

// For test backward compatibility
export const forgeHolyFirePaladinSword = forgeWeapon;
