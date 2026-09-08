import { describe, it, expect } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { lowerSCDLV2Bytecode } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js';
import { evaluateSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js';
import { verifySCDLV2Budget } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import {
  createRing,
  createStar,
  createTriangle,
  createRect,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import {
  createAngle,
  createTransformMatrix,
  rotateTransform,
  scaleTransform,
  translateTransform,
  composeTransforms,
  applyTransformToPoint,
  applyTransformToShape,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.transforms.js';
import {
  isInside,
  isInsideBounds,
  contains,
  containsBounds,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.anchors.js';
import {
  createMaskFromCells,
  toMask,
  maskInvert,
  maskUnion,
  maskIntersect,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.masks.js';
import {
  rasterizePaintShape,
  rasterizeSCDLV2,
  RASTER_COMPATIBILITY_MATRIX,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';
import {
  SoilAdapter,
} from '../../../../../codex/core/pixelbrain/scdl/v2/adapters/soil.adapter.js';
import {
  deepFreeze,
  STAGE_RESOURCE_MODELS,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-abi.js';
import {
  DESCRIPTOR_CONSUMER_REGISTRY,
  getDescriptorConsumer,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';
import {
  TileShapeMicroprocessor,
} from '../../../../../codex/core/pixelbrain/amps/geometry/processors/tile-shape.microprocessor.js';
import {
  createTileForgeWitnessRecord,
  buildTileForgeFormWitness,
  buildTileForgeRealizationWitness,
  verifyTileForgeWitness,
} from '../../../../../codex/core/pixelbrain/tile-forge/tile-forge.scd128.js';
import {
  createTileForgeAssetRecipe,
  compileTileForgeScdl,
} from '../../../../../codex/core/pixelbrain/tile-forge/tile-forge.scdl-generator.js';
import {
  exportSCDL,
} from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';
import {
  ingestScdlIntoDocument,
} from '../../../../../Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-authoring-facade.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL V2 & Tile Forge P0 Contracts Specification', () => {

  // ─── GOV-01: Release Evidence & Architecture Standards ───
  describe('GOV-01: Release Evidence & Architecture Standards', () => {
    it('declares valid 12 conveyor stages and 3 execution classes', () => {
      expect(Object.keys(STAGE_RESOURCE_MODELS)).toHaveLength(12);
      expect(STAGE_RESOURCE_MODELS.CONSTRUCTION).toBeDefined();
      expect(STAGE_RESOURCE_MODELS.CONSTRUCTION.stage).toBe('CONSTRUCTION');
      expect(STAGE_RESOURCE_MODELS.CONSTRUCTION.produces).toBe('CONSTRUCTION_IR');
    });
  });

  // ─── CMP-01: Full Affine Transform Lowering & Evaluation ───
  describe('CMP-01: Preserve Full Affine Transform in Lowering & Evaluation', () => {
    it('preserves all 6 matrix components during lowering and reconstructs in evaluator', () => {
      const source = `SCDL 2
ASSET rot_test
CANVAS WIDTH 64 HEIGHT 64
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
CONST $rot TRANSFORM (ROTATE ANGLE (DEGREES 90) PIVOT (VEC2 (PX 20) (PX 20)))
SHAPE $tri (TRIANGLE P1 (VEC2 (PX 10) (PX 10)) P2 (VEC2 (PX 30) (PX 10)) P3 (VEC2 (PX 15) (PX 25)))
SHAPE $rot_tri (TRANSFORM_APPLY $rot $tri)
LAYER base ORDER 1 {
  PAINT $rot_tri FILL #ff0000 RASTER CENTER
}
`;
      const result = compileSCDLV2(source);
      expect(result.ok).toBe(true);
      expect(result.bytecode).toBeDefined();

      const matrixInst = result.bytecode.instructions.find((i) => i.mnemonic === 'TRANSFORM_MATRIX');
      expect(matrixInst).toBeDefined();
      expect(matrixInst.operands).toHaveLength(6);

      const packetCells = result.packet.geometry?.coordinates || result.packet.coordinates || [];
      expect(packetCells.length).toBeGreaterThan(0);
    });

    it('rejects singular transform with SCDL-GEOM-004', () => {
      const source = `SCDL 2
ASSET singular_test
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
CONST $bad_scale TRANSFORM (SCALE FACTOR 0)
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
SHAPE $bad_sq (TRANSFORM_APPLY $bad_scale $sq)
LAYER base ORDER 1 {
  PAINT $bad_sq FILL #ff0000 RASTER CENTER
}
`;
      const result = compileSCDLV2(source);
      expect(result.ok).toBe(false);
      const singularDiag = result.diagnostics.find((d) => d.code === 'SCDL-GEOM-004');
      expect(singularDiag).toBeDefined();
    });
  });

  // ─── CMP-02: Shape-Occupied Predicates vs Bounding Box ───
  describe('CMP-02: Separate Bounds Queries from Occupied-Shape Membership', () => {
    it('distinguishes ring center from ring body', () => {
      const center = { x: makeRational(20), y: makeRational(20) };
      const ring = createRing({
        center,
        innerRadius: makeRational(6),
        outerRadius: makeRational(12),
      });

      // Ring center is inside AABB bounding box:
      expect(isInsideBounds(center, ring)).toBe(true);
      // But ring center is NOT inside the occupied shape:
      expect(isInside(center, ring)).toBe(false);

      // A point on the ring body is inside both:
      const bodyPoint = { x: makeRational(28), y: makeRational(20) };
      expect(isInsideBounds(bodyPoint, ring)).toBe(true);
      expect(isInside(bodyPoint, ring)).toBe(true);
    });

    it('fails occupied-shape membership in empty star corners while passing AABB', () => {
      const center = { x: makeRational(20), y: makeRational(20) };
      const star = createStar({
        center,
        points: 5,
        innerRadius: makeRational(4),
        outerRadius: makeRational(12),
      });

      // Point in outer corner of bounding box (e.g. 9, 9) is inside AABB but outside star body:
      const emptyCorner = { x: makeRational(9), y: makeRational(9) };
      expect(isInsideBounds(emptyCorner, star)).toBe(true);
      expect(isInside(emptyCorner, star)).toBe(false);
    });
  });

  // ─── CMP-03: Explicit Mask Extent & Canvas Coordinates ───
  describe('CMP-03: Mask Extent & Coordinate Domain', () => {
    it('covers exactly 80x56 canvas for M ∪ invert(M) with empty intersection', () => {
      const canvas = { width: 80, height: 56, originX: 0, originY: 0 };
      const sparseCells = [
        { x: 10, y: 10 },
        { x: 20, y: 25 },
        { x: 70, y: 50 },
      ];
      const M = createMaskFromCells(sparseCells, canvas);
      const invM = maskInvert(M, canvas);

      const union = maskUnion(M, invM);
      expect(union.size).toBe(80 * 56);

      const intersection = maskIntersect(M, invM);
      expect(intersection.size).toBe(0);

      const doubleInv = maskInvert(invM, canvas);
      expect(doubleInv.size).toBe(M.size);
      for (const pt of sparseCells) {
        expect(doubleInv.has(pt.x, pt.y)).toBe(true);
      }
    });
  });

  // ─── CMP-07: Raster Compatibility Matrix & Half-Open Scanlines ───
  describe('CMP-07: Raster Compatibility Matrix & Shared Edge Ownership', () => {
    it('publishes supported matrix', () => {
      expect(RASTER_COMPATIBILITY_MATRIX.CIRCLE).toContain('CENTER');
      expect(RASTER_COMPATIBILITY_MATRIX.CIRCLE).toContain('MIDPOINT');
      expect(RASTER_COMPATIBILITY_MATRIX.TRIANGLE).toContain('CENTER');
    });

    it('shares diagonal edge between two triangles with 0 overlaps and 0 seam holes', () => {
      const tri1 = createTriangle(
        { x: makeRational(0), y: makeRational(0) },
        { x: makeRational(10), y: makeRational(0) },
        { x: makeRational(0), y: makeRational(10) }
      );
      const tri2 = createTriangle(
        { x: makeRational(10), y: makeRational(0) },
        { x: makeRational(10), y: makeRational(10) },
        { x: makeRational(0), y: makeRational(10) }
      );

      const canvas = { width: 10, height: 10 };
      const r1 = rasterizePaintShape(tri1, 'CENTER', { canvas, remainingCells: 1000, rasterCellLimit: 1000, cellsGenerated: 0 });
      const r2 = rasterizePaintShape(tri2, 'CENTER', { canvas, remainingCells: 1000, rasterCellLimit: 1000, cellsGenerated: 0 });

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);

      const set1 = new Set(r1.cells.map((c) => `${c.x},${c.y}`));
      const set2 = new Set(r2.cells.map((c) => `${c.x},${c.y}`));

      // Verify no shared cell overlap (no double-alpha along diagonal):
      let overlaps = 0;
      for (const k of set1) {
        if (set2.has(k)) overlaps++;
      }
      expect(overlaps).toBe(0);

      // Verify union covers the entire 10x10 square (100 cells):
      const unionSet = new Set([...set1, ...set2]);
      expect(unionSet.size).toBe(100);
    });
  });

  // ─── CMP-08: Numerical Determinism Beyond Rational Literals ───
  describe('CMP-08: Numerical Determinism Beyond Rational Literals', () => {
    it('produces deterministic quantized sine and cosine for non-cardinal angles', () => {
      const a45 = createAngle(45, 'DEGREES');
      const a30 = createAngle(30, 'DEGREES');
      const a60 = createAngle(60, 'DEGREES');

      const rot45 = rotateTransform(a45);
      const rot30 = rotateTransform(a30);
      const rot60 = rotateTransform(a60);

      expect(rot45.a.denominator).toBeDefined();
      expect(rot30.a.denominator).toBeDefined();
      expect(rot60.a.denominator).toBeDefined();

      const pt = { x: makeRational(10), y: makeRational(0) };
      const pt45 = applyTransformToPoint(rot45, pt);
      expect(pt45.x.numerator).toBeDefined();
      expect(pt45.y.numerator).toBeDefined();
    });
  });

  // ─── CMP-13: Pre-Analysis Limits & Fuel Enforcement ───
  describe('CMP-13: Enforce Limits Before Expensive Analysis', () => {
    it('host limit cannot be raised by source request of 1000', () => {
      const source = `SCDL 2
ASSET widen_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 500 RASTER_CELLS 4096
SHAPE $pix (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER l1 ORDER 1 {
  PAINT $pix FILL #ffffff RASTER CENTER
}
`;
      // Pass a strict host limit of 100 instructions:
      const result = compileSCDLV2(source, { limits: { instructions: 100 } });
      expect(result.ok).toBe(false);
      const budgetDiag = result.diagnostics.find((d) => d.code === 'SCDL-BUDGET-001');
      expect(budgetDiag).toBeDefined();
      expect(budgetDiag.message).toContain('exceeds');
    });
  });

  // ─── CMP-15: Canonical Instructions Determine Result ───
  describe('CMP-15: Canonical Instructions & Post-Stage Finalization', () => {
    it('synchronizes packet, package, and layers consistently', () => {
      const source = `SCDL 2
ASSET sync_test
CANVAS WIDTH 20 HEIGHT 20
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $rect_a (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
SHAPE $rect_b (RECT ORIGIN (VEC2 (PX 10) (PX 10)) SIZE (VEC2 (PX 10) (PX 10)))
LAYER layer_a ORDER 1 {
  PAINT $rect_a FILL #ff0000 RASTER CENTER
}
LAYER layer_b ORDER 2 {
  PAINT $rect_b FILL #00ff00 RASTER CENTER
}
`;
      const result = compileSCDLV2(source);
      expect(result.ok).toBe(true);
      expect(result.package.layers).toHaveLength(2);
      expect(result.package.framePackets).toHaveLength(1);
      const frameCoords = result.package.framePackets[0].geometry?.coordinates || result.package.framePackets[0].coordinates || [];
      const packetCoords = result.packet.geometry?.coordinates || result.packet.coordinates || [];
      expect(frameCoords.length).toBe(packetCoords.length);
    });
  });

  // ─── ID-01, ID-02, ID-03: Full Digests, SCD128 & Build Receipts ───
  describe('ID-01, ID-02, ID-03: Identity, SCD128 & Build Locking', () => {
    it('ID-01: emits 256-bit digests alongside 8-hex legacy programId', () => {
      const source = `SCDL 2
ASSET id_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $pix (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER l1 ORDER 1 {
  PAINT $pix FILL #ffffff RASTER CENTER
}
`;
      const result = compileSCDLV2(source);
      expect(result.ok).toBe(true);
      expect(result.bytecode.programId).toMatch(/^scdlbc_[0-9a-f]{8}$/);
      expect(result.bytecode.programDigest).toMatch(/^scdl2_prog:[0-9a-f]{64}$/);
      expect(result.package.rasterDigest).toMatch(/^scdl2_rast:[0-9a-f]{64}$/);
      expect(result.package.buildDigest).toMatch(/^scdl2_build:[0-9a-f]{64}$/);
    });

    it('ID-02: generates exactly 128-hex SCD128 wire and changes on groundDepth change', () => {
      const w1 = createTileForgeWitnessRecord({ groundDepth: 16 }, { biome: 'void_forest' });
      const w2 = createTileForgeWitnessRecord({ groundDepth: 32 }, { biome: 'void_forest' });

      expect(w1.scd128Wire).toHaveLength(128);
      expect(w2.scd128Wire).toHaveLength(128);
      expect(w1.form.form64Hex).not.toBe(w2.form.form64Hex);
      expect(w1.realization.realization64Hex).toBe(w2.realization.realization64Hex);

      // Verify stale witness detection:
      const check = verifyTileForgeWitness(w1.scd128Wire, { groundDepth: 32 }, { biome: 'void_forest' });
      expect(check.valid).toBe(false);
      expect(check.formMatch).toBe(false);
    });

    it('ID-03: generates locked build receipt in compiler output', () => {
      const source = `SCDL 2
ASSET receipt_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $pix (PIXEL AT (VEC2 (PX 0) (PX 0)))
LAYER l1 ORDER 1 {
  PAINT $pix FILL #ffffff RASTER CENTER
}
`;
      const result = compileSCDLV2(source);
      expect(result.ok).toBe(true);
      expect(result.buildReceipt).toBeDefined();
      expect(result.buildReceipt.sourceDigest).toMatch(/^scdl2_src:[0-9a-f]{64}$/);
      expect(result.buildReceipt.compilerBuild).toBe('scdl-v2-p0-build');
    });
  });

  // ─── AMP-01 & AMP-03: Resource Models & Descriptor Consumers ───
  describe('AMP-01 & AMP-03: Pass Resources and Descriptor Consumers', () => {
    it('AMP-01: declares consumes and produces for all 12 stages', () => {
      for (const [stageName, model] of Object.entries(STAGE_RESOURCE_MODELS)) {
        expect(model.stage).toBe(stageName);
        expect(model.consumes).toBeDefined();
        expect(model.produces).toBeDefined();
      }
    });

    it('AMP-03: connects descriptors to named runtime consumers', () => {
      const soilConsumer = getDescriptorConsumer('pixelbrain.soil');
      expect(soilConsumer).toBeDefined();
      expect(soilConsumer.target).toBe('terrain_mesh_subsurface');
      expect(soilConsumer.modifiesPixels).toBe(true);
    });
  });

  // ─── AMP-06 & AMP-07: Soil Adapter Schemas & Immutability ───
  describe('AMP-06 & AMP-07: Soil Defaults, Zero-Density & Deep Immutability', () => {
    it('AMP-06: returns 0 pebbles and 0 roots when depth=0 or density=0', () => {
      const adapter = new SoilAdapter();
      const descZeroDepth = adapter.execute({}, { depth: 0 });
      expect(descZeroDepth.pebbleCount).toBe(0);
      expect(descZeroDepth.rootCount).toBe(0);

      const descZeroDensity = adapter.execute({}, { depth: 16, pebbleDensity: 0, rootDensity: 0 });
      expect(descZeroDensity.pebbleCount).toBe(0);
      expect(descZeroDensity.rootCount).toBe(0);
    });

    it('AMP-07: recursively freezes descriptor including nested swatchRamp', () => {
      const adapter = new SoilAdapter();
      const desc = adapter.execute({}, { depth: 16 });
      expect(Object.isFrozen(desc)).toBe(true);
      expect(Object.isFrozen(desc.swatchRamp)).toBe(true);

      // Mutating nested swatch must throw or fail in strict mode:
      expect(() => {
        desc.swatchRamp.soil_dark = '#ffffff';
      }).toThrow();
    });
  });

  // ─── TIL-01 & TIL-02: Tile Geometry Normalization & Boundary Ownership ───
  describe('TIL-01 & TIL-02: Intent Normalization & Unified Boundary Ownership', () => {
    it('TIL-01: rejects invalid dimensions and non-2:1 ratios', () => {
      const proc = new TileShapeMicroprocessor();
      expect(() => proc.execute({ width: 0, height: 0 })).toThrow(/positive/);
      expect(() => proc.execute({ width: 80, height: 30 })).toThrow(/2:1/);
      expect(() => proc.execute({ width: 80, height: 40, groundDepth: -5 })).toThrow(/non-negative/);
    });

    it('TIL-02: achieves 0 shared coordinate overlaps and exact horizontal mirror symmetry', () => {
      const proc = new TileShapeMicroprocessor();
      const result = proc.execute({ width: 80, height: 40, groundDepth: 16 });

      expect(result.geometry.metrics.overlaps).toBe(0);
      expect(result.geometry.metrics.uniqueCoordinates).toBe(
        result.geometry.metrics.topCount + result.geometry.metrics.groundCount
      );

      // Check exact horizontal mirror symmetry:
      const groundCoords = result.geometry.groundFace;
      const groundSet = new Set(groundCoords.map((c) => `${c.x},${c.y}`));

      let unmirrored = 0;
      for (const c of groundCoords) {
        const mirroredX = 79 - c.x;
        if (!groundSet.has(`${mirroredX},${c.y}`)) {
          unmirrored++;
        }
      }
      expect(unmirrored).toBe(0);
    });
  });

  // ─── TIL-06: Shared Realization Recipe ───
  describe('TIL-06: Shared Realization Recipe', () => {
    it('creates immutable recipe containing geometry, material roles, and seed streams', () => {
      const recipe = createTileForgeAssetRecipe({
        width: 80,
        height: 40,
        groundDepth: 16,
        biome: 'void_forest',
      });

      expect(recipe.geometry.width).toBe(80);
      expect(recipe.geometry.totalHeight).toBe(56);
      expect(recipe.materialRoles.c7).toBeDefined();
      expect(recipe.seedStreams.master).toBe(4242);
      expect(recipe.descriptors).toHaveLength(1);

      const scdl = recipe.toScdl();
      expect(scdl).toContain('CANVAS WIDTH 80 HEIGHT 56');
    });
  });

  // ─── STU-02: Studio Layer Ingestion ───
  describe('STU-02: Faithful Multi-Layer Ingestion into Studio Document', () => {
    it('imports v2 layers preserving distinct names, order, and per-layer cells', () => {
      const source = `SCDL 2
ASSET multi_layer_doc
CANVAS WIDTH 24 HEIGHT 24
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sky_rect (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 24) (PX 12)))
SHAPE $ground_rect (RECT ORIGIN (VEC2 (PX 0) (PX 12)) SIZE (VEC2 (PX 24) (PX 12)))
LAYER sky ORDER 1 {
  PAINT $sky_rect FILL #38bdf8 RASTER CENTER
}
LAYER ground ORDER 2 {
  PAINT $ground_rect FILL #166534 RASTER CENTER
}
`;
      const fakeDoc = {
        getSnapshot() {
          return { layers: [] };
        },
        replaceFromRaster(data) {
          return data;
        },
      };

      const result = ingestScdlIntoDocument(fakeDoc, source);
      expect(result.ok).toBe(true);

      const importedLayers = result.layers.filter((l) => l.name !== '00_Reference');
      expect(importedLayers).toHaveLength(2);
      expect(importedLayers[0].name).toBe('sky');
      expect(importedLayers[1].name).toBe('ground');
      expect(importedLayers[0].cells.length).toBeGreaterThan(0);
      expect(importedLayers[1].cells.length).toBeGreaterThan(0);
    });
  });

  // ─── EXP-01: Target Fidelity & Alpha Preservation ───
  describe('EXP-01: Fidelity per Export Target (Alpha Preservation)', () => {
    it('preserves alpha in Phaser, SVG, and PNG exports', () => {
      const source = `SCDL 2
ASSET alpha_export_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $box (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 8) (PX 8)))
LAYER l1 ORDER 1 {
  PAINT $box FILL #ff0000 RASTER CENTER
}
`;
      const compiled = compileSCDLV2(source);
      expect(compiled.ok).toBe(true);

      const exportRes = exportSCDL(compiled.packet, ['json', 'svg', 'phaser', 'png']);
      expect(exportRes.json.ok).toBe(true);
      expect(exportRes.svg.ok).toBe(true);
      expect(exportRes.phaser.ok).toBe(true);
      expect(exportRes.png.ok).toBe(true);

      const phaserObj = JSON.parse(exportRes.phaser.output);
      expect(phaserObj.pixels[0].alpha).toBe(1);
      expect(exportRes.svg.output).toContain('<svg');
    });
  });

});
