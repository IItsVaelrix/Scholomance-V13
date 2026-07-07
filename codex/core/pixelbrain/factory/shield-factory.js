/**
 * Shield Factory — buckler (radial-v1)
 *
 * Declares the seam-checked route for a small round buckler shield built
 * from concentric radial geometry:
 *
 *     ──────── rim (outer ring, r > 7) ────────
 *     │                                       │
 *     │     ──── face (annulus, 3<r≤7) ──     │
 *     │     │                              │   │
 *     │     │     boss (disc, r ≤ 3)        │   │
 *     │     │           ●                  │   │
 *     │     │                              │   │
 *     │     └──────────────────────────────┘   │
 *     └───────────────────────────────────────┘
 *
 * Three parts: `boss` (central boss disc), `face` (the flat annular plate),
 * `rim` (the rolled outer edge). All thresholds are derived from a 16×16
 * canvas centred at (8, 8) with the radius values shown above:
 *
 *   boss  ≈ π·3²  ≈ 28 cells  →  minCells 20
 *   face  ≈ π·40 ≈ 125 cells →  minCells 80
 *   rim   ≈ π·15 ≈ 47 cells  →  minCells 30
 *
 * As with the other factories, the steps here are contract-only. The
 * buckler geometry is produced outside the route; the route's `seam`
 * declarations + `requiredOutputs` are validated against that geometry by
 * `validateRoute`. No `execute` body is attached to any step.
 */
import { expandShapeGrammar } from '../shape-grammar-engine.js';

const BUCKLER_BOSS_RADIUS = 3;
const BUCKLER_FACE_OUTER = 7;
const BUCKLER_RIM_OUTER = 8;

const bucklerGrammar = {
  id: 'shield.buckler.radial-v1',
  version: '1.0.0',
  expand: (ctx) => {
    for (const part of ctx.spec.parts) {
      ctx.addPart(part);
    }

    ctx.requireOutput({ id: 'boss-cells', kind: 'partCells', selector: 'boss', minCells: 20, fatal: true });
    ctx.requireOutput({ id: 'face-cells', kind: 'partCells', selector: 'face', minCells: 80, fatal: true });
    ctx.requireOutput({ id: 'rim-cells', kind: 'partCells', selector: 'rim', minCells: 30, fatal: true });

    ctx.requireOutput({ id: 'boss-fill', kind: 'materialSlot', selector: 'boss.fill', fatal: true });
    ctx.requireOutput({ id: 'face-fill', kind: 'materialSlot', selector: 'face.fill', fatal: true });
    ctx.requireOutput({ id: 'rim-fill', kind: 'materialSlot', selector: 'rim.fill', fatal: true });

    const shaderTargets = Array.isArray(ctx.spec.shader?.targetParts) ? ctx.spec.shader.targetParts : [];
    for (const targetPart of shaderTargets) {
      ctx.requireOutput({
        id: `${targetPart}-shader-mask`,
        kind: 'shaderMask',
        selector: targetPart,
        minCells: 1,
        fatal: true,
      });
    }

    if (ctx.spec.heraldry?.some((entry) => entry.required !== false)) {
      ctx.requireOutput({ id: 'emblem-cells', kind: 'heraldryCells', selector: 'emblem', minCells: 1, fatal: true });
    }
  }
};

function requiredStepForBuckler(req) {
  if (req.kind === 'heraldryCells') return 'HeraldryAMP';
  if (req.kind === 'shaderMask') return 'GeometryAMP';
  if (req.kind === 'materialSlot') return 'RegionFillAMP';
  return 'SilhouetteComposer';
}

function requiredSeamForBuckler(req) {
  if (req.kind === 'heraldryCells') return 'heraldry-template-v1';
  if (req.kind === 'shaderMask') return 'geometry-mask-v1';
  if (req.kind === 'materialSlot') return 'region-fill-v1';
  return 'silhouette-v1';
}

export function forgeShield(spec, skeleton) {
  const expansion = expandShapeGrammar(spec, skeleton, bucklerGrammar);

  const partIds = ['boss', 'face', 'rim'];
  const routeDefinition = {
    name: 'shield.buckler.radial-v1',
    requiredOutputs: expansion.requiredOutputs,
    requiredOutputSteps: Object.fromEntries(expansion.requiredOutputs.map((req) => [req.id, requiredStepForBuckler(req)])),
    requiredOutputSeams: Object.fromEntries(expansion.requiredOutputs.map((req) => [req.id, requiredSeamForBuckler(req)])),
    steps: [
      {
        name: 'SilhouetteComposer',
        seam: {
          id: 'silhouette-v1', processor: 'pixelbrain.silhouette', version: '1.0.0',
          consumes: ['spec.parts'],
          emits: [
            'silhouette.cells',
            'silhouette.partOf',
            ...partIds.map((id) => `part.${id}.cells`),
          ],
        },
      },
      {
        name: 'ConstructionAMP',
        seam: {
          id: 'construction-skeleton-v1', processor: 'pixelbrain.construction', version: '1.0.0',
          consumes: ['spec.construction', 'silhouette.cells'],
          emits: ['construction.skeleton', 'construction.anchors'],
        },
      },
      {
        name: 'ShapeGrammarExpansion',
        seam: {
          id: 'shape-grammar-v1', processor: 'pixelbrain.shapeGrammar', version: '1.0.0',
          consumes: ['spec.parts', 'construction.skeleton'],
          emits: ['shape.parts', 'shape.requiredOutputs', 'shape.seams'],
        },
      },
      {
        name: 'TemplateComposer',
        seam: {
          id: 'template-composer-v1', processor: 'pixelbrain.template', version: '1.0.0',
          consumes: ['silhouette.cells'],
          emits: ['template.coordinates'],
        },
      },
      {
        name: 'HeraldryAMP',
        seam: {
          id: 'heraldry-template-v1', processor: 'pixelbrain.heraldry', version: '0.3.0',
          consumes: ['template.coordinates', 'silhouette.partOf', 'spec.heraldry', 'construction.anchors'],
          emits: ['heraldry.cells', 'template.coordinates.heraldry'],
          mutates: ['silhouette.partOf'],
          validates: ['emblem.cells > 0 when required'],
        },
      },
      {
        name: 'ShieldAMP',
        seam: {
          id: 'shield-template-v1', processor: 'pixelbrain.shield', version: '1.0.0',
          consumes: ['template.coordinates.heraldry', 'silhouette.partOf', 'shape.parts'],
          emits: ['template.coordinates.shield', 'diagnostics.shield'],
          mutates: ['silhouette.partOf'],
          mergeContract: 'ordered-template-retag-after-heraldry-v1',
          validates: [],
        },
      },
      {
        name: 'MotifEngraver',
        seam: {
          id: 'motif-engraver-v1', processor: 'pixelbrain.motif', version: '1.0.0',
          consumes: ['silhouette.partOf', 'spec.parts'],
          emits: ['motif.cells'],
        },
      },
      {
        name: 'RegionFillAMP',
        seam: {
          id: 'region-fill-v1', processor: 'pixelbrain.regionFill', version: '1.0.0',
          consumes: ['template.coordinates.shield', 'silhouette.partOf', 'motif.cells', 'spec.parts'],
          emits: [
            'fills.coordinates',
            ...partIds.flatMap((id) => [
              `material.${id}.fill`,
              `material.${id}.trim`,
              `material.${id}.outline`,
            ]),
          ],
        },
      },
      {
        name: 'FinishPasses',
        seam: {
          id: 'finish-passes-v1', processor: 'pixelbrain.finish', version: '1.0.0',
          consumes: ['fills.coordinates'],
          emits: ['fills.polished'],
        },
      },
      {
        name: 'GeometryAMP',
        seam: {
          id: 'geometry-mask-v1', processor: 'pixelbrain.geometry', version: '1.0.0',
          consumes: ['fills.polished', 'silhouette.partOf'],
          emits: [
            'geometry.masks',
            ...partIds.map((id) => `geometry.mask.${id}`),
          ],
          validates: ['shader target masks exist before shader forge'],
        },
      },
    ]
  };

  return { routeDefinition, expansion };
}

export { BUCKLER_BOSS_RADIUS, BUCKLER_FACE_OUTER, BUCKLER_RIM_OUTER };
