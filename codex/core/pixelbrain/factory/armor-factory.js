/**
 * Armor Factory — chestplate (sovereign-v1)
 *
 * Declares the seam-checked route for a chestplate. This route is the
 * *contract* on the data flow: the foundry (item-foundry.js) produces the
 * actual geometry outside the route, and the route's step `seam`
 * declarations + `requiredOutputs` are validated by `validateRoute` against
 * that geometry. Steps here have no `execute` body — the seam alone is the
 * contract. The route is walked to catch contract drift (e.g. a refactor
 * that breaks the heraldry → chestplate ordering or a required output that
 * loses its responsible processor).
 *
 * The only step in any PixelBrain route that has a real `execute` body is
 * `createVolumeLiftStep` (volume-lift-amp.js), which the foundry routes
 * through `executeRoute` because it must mutate `results.voxel.volume`.
 */
import { expandShapeGrammar } from '../shape-grammar-engine.js';

const chestplateGrammar = {
  id: 'armor.chestplate.sovereign-v1',
  version: '1.0.0',
  expand: (ctx) => {
    for (const part of ctx.spec.parts) {
      ctx.addPart(part);
    }

    if (ctx.spec.heraldry?.some((entry) => entry.required !== false)) {
      ctx.requireOutput({ id: 'emblem-cells', kind: 'heraldryCells', selector: 'emblem', minCells: 1, fatal: true });
    }
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

    for (const part of ctx.spec.parts) {
      if (part.id === 'left_pauldron' || part.id === 'right_pauldron') {
        ctx.requireOutput({ id: `${part.id}-cells`, kind: 'partCells', selector: part.id, minCells: 50, fatal: true });
        ctx.requireOutput({ id: `${part.id}-fill`, kind: 'materialSlot', selector: `${part.id}.fill`, fatal: true });
      }
    }
  }
};

export function forgeArmor(spec, skeleton) {
  const expansion = expandShapeGrammar(spec, skeleton, chestplateGrammar);

  const routeDefinition = {
    name: 'armor.chestplate.sovereign-v1',
    requiredOutputs: expansion.requiredOutputs,
    requiredOutputSteps: Object.fromEntries(expansion.requiredOutputs.map((req) => {
      if (req.kind === 'heraldryCells') return [req.id, 'HeraldryAMP'];
      if (req.kind === 'shaderMask') return [req.id, 'GeometryAMP'];
      if (req.kind === 'materialSlot') return [req.id, 'RegionFillAMP'];
      return [req.id, 'SilhouetteComposer'];
    })),
    requiredOutputSeams: Object.fromEntries(expansion.requiredOutputs.map((req) => {
      if (req.kind === 'heraldryCells') return [req.id, 'heraldry-template-v1'];
      if (req.kind === 'shaderMask') return [req.id, 'geometry-mask-v1'];
      if (req.kind === 'materialSlot') return [req.id, 'region-fill-v1'];
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
        name: 'ChestplateAMP',
        seam: {
          id: 'chestplate-template-v1', processor: 'pixelbrain.chestplate', version: '1.0.0',
          consumes: ['template.coordinates.heraldry', 'silhouette.partOf', 'shape.parts'],
          emits: ['template.coordinates.chestplate', 'diagnostics.chestplate'],
          mutates: ['silhouette.partOf'],
          mergeContract: 'ordered-template-retag-after-heraldry-v1',
          validates: ['strict symmetry requires paired pauldrons'],
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
          consumes: ['template.coordinates.chestplate', 'silhouette.partOf', 'motif.cells', 'spec.parts'],
          emits: [
            'fills.coordinates',
            ...spec.parts.flatMap((part) => [
              `material.${part.id}.fill`,
              `material.${part.id}.trim`,
              `material.${part.id}.outline`,
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
            ...spec.parts.map((part) => `geometry.mask.${part.id}`),
          ],
          validates: ['shader target masks exist before shader forge'],
        },
      },
    ]
  };

  return { routeDefinition, expansion };
}
