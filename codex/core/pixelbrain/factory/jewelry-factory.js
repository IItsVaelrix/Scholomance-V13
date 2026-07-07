/**
 * Jewelry Factory — amulet (radial-v1)
 *
 * Declares the seam-checked route for a circular amulet built from
 * concentric radial geometry centred on the gem:
 *
 *     ───── chain (outer ring, r > 3) ─────
 *     │                                    │
 *     │      ── bezel (ring, 2<r≤3) ──     │
 *     │      │                          │   │
 *     │      │   gem (disc, r ≤ 2)      │   │
 *     │      │          ●               │   │
 *     │      │                          │   │
 *     │      └──────────────────────────┘   │
 *     └────────────────────────────────────┘
 *
 * Three parts: `gem` (central stone disc), `bezel` (mounting ring),
 * `chain` (outer suspension ring). Thresholds are derived from a 12×14
 * canvas centred at (6, 8) with the radius values shown above:
 *
 *   gem   ≈ π·4  ≈ 12 cells →  minCells 8
 *   bezel ≈ π·5  ≈ 16 cells →  minCells 10
 *   chain ≈ π·7  ≈ 22 cells →  minCells 15
 *
 * As with the other factories, the steps here are contract-only. The
 * amulet geometry is produced outside the route; the route's `seam`
 * declarations + `requiredOutputs` are validated against that geometry by
 * `validateRoute`. No `execute` body is attached to any step.
 */
import { expandShapeGrammar } from '../shape-grammar-engine.js';

const AMULET_GEM_RADIUS = 2;
const AMULET_BEZEL_OUTER = 3;
const AMULET_CHAIN_OUTER = 4;

const amuletGrammar = {
  id: 'jewelry.amulet.radial-v1',
  version: '1.0.0',
  expand: (ctx) => {
    for (const part of ctx.spec.parts) {
      ctx.addPart(part);
    }

    ctx.requireOutput({ id: 'gem-cells', kind: 'partCells', selector: 'gem', minCells: 8, fatal: true });
    ctx.requireOutput({ id: 'bezel-cells', kind: 'partCells', selector: 'bezel', minCells: 10, fatal: true });
    ctx.requireOutput({ id: 'chain-cells', kind: 'partCells', selector: 'chain', minCells: 15, fatal: true });

    ctx.requireOutput({ id: 'gem-fill', kind: 'materialSlot', selector: 'gem.fill', fatal: true });
    ctx.requireOutput({ id: 'bezel-fill', kind: 'materialSlot', selector: 'bezel.fill', fatal: true });
    ctx.requireOutput({ id: 'chain-fill', kind: 'materialSlot', selector: 'chain.fill', fatal: true });

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
  }
};

function requiredStepForAmulet(req) {
  if (req.kind === 'shaderMask') return 'GeometryAMP';
  if (req.kind === 'materialSlot') return 'RegionFillAMP';
  return 'SilhouetteComposer';
}

function requiredSeamForAmulet(req) {
  if (req.kind === 'shaderMask') return 'geometry-mask-v1';
  if (req.kind === 'materialSlot') return 'region-fill-v1';
  return 'silhouette-v1';
}

export function forgeJewelry(spec, skeleton) {
  const expansion = expandShapeGrammar(spec, skeleton, amuletGrammar);

  const partIds = ['gem', 'bezel', 'chain'];
  const routeDefinition = {
    name: 'jewelry.amulet.radial-v1',
    requiredOutputs: expansion.requiredOutputs,
    requiredOutputSteps: Object.fromEntries(expansion.requiredOutputs.map((req) => [req.id, requiredStepForAmulet(req)])),
    requiredOutputSeams: Object.fromEntries(expansion.requiredOutputs.map((req) => [req.id, requiredSeamForAmulet(req)])),
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
        name: 'JewelryAMP',
        seam: {
          id: 'jewelry-template-v1', processor: 'pixelbrain.jewelry', version: '1.0.0',
          consumes: ['template.coordinates', 'silhouette.partOf', 'shape.parts'],
          emits: ['template.coordinates.jewelry', 'diagnostics.jewelry'],
          mutates: ['silhouette.partOf'],
          mergeContract: 'ordered-template-retag-v1',
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
          consumes: ['template.coordinates.jewelry', 'silhouette.partOf', 'motif.cells', 'spec.parts'],
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

export { AMULET_GEM_RADIUS, AMULET_BEZEL_OUTER, AMULET_CHAIN_OUTER };
