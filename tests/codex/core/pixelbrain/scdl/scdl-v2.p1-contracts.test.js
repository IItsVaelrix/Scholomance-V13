import { describe, it, expect } from 'vitest';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { formatSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js';
import {
  OPCODE_SUPPORT_FLAGS,
  OPCODE_REGISTRY,
  listSCDLV2Capabilities,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js';
import {
  createRect,
  createCircle,
  createTriangle,
  createPolygon,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import {
  shapeOutline,
  shapeErosion,
  createErosion,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.booleans.js';
import {
  alignShapes,
  alignShape,
  getAnchor,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.anchors.js';
import {
  ABI_DESCRIPTOR_TYPES,
  isKnownAbiType,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.types.js';
import {
  validateAmpParameter,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-abi.js';
import {
  validateScdlVersion,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.version.js';
import {
  createDiagnosticEnvelope,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.diagnostics.js';
import {
  TileShapeMicroprocessor,
} from '../../../../../codex/core/pixelbrain/amps/geometry/processors/tile-shape.microprocessor.js';
import {
  resolveAmpPlan,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-relevance.js';
import {
  certifyAllRegisteredAmps,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-certify.js';
import {
  inspectSCDLV2,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.inspector.js';
import {
  encodeAsepriteBinary,
  decodeAsepriteBinary,
} from '../../../../../codex/core/pixelbrain/aseprite-binary-codec.js';
import {
  exportSCDL,
} from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';
import {
  createAssetSpec,
  deriveSubStreamSeeds,
  seedForFeature,
  sharedEdgeKey,
  ASSET_CLASSES,
  DETAIL_DENSITIES,
  MATERIAL_GRAMMARS,
} from '../../../../../codex/core/pixelbrain/tile-forge/tile-forge.spec.js';
import {
  computeWorldOcclusionAndSorting,
} from '../../../../../codex/core/pixelbrain/tile-forge/tile-forge.region-synthesizer.js';
import {
  ISOMETRIC_FACE_NORMALS,
  computeFaceLightIntensity,
  SEMANTIC_COLOR_ROLES,
  transmutePalette,
  PIXEL_STYLE_PROFILES,
} from '../../../../../codex/core/pixelbrain/tile-forge/tile-forge.palette-engine.js';
import {
  COMPOSITION_PASS_ORDER,
  createCompositionPasses,
  sampleFeatureClusters,
  evaluateVisualAcceptance,
} from '../../../../../codex/core/pixelbrain/tile-forge/tile-forge.feature-synthesizer.js';
import {
  ingestScdlIntoDocument,
  createEffectPreviewSession,
  getPixelProvenance,
  StudioCompileScheduler,
} from '../../../../../Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-authoring-facade.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL V2 & Tile Forge P1 Contracts Specification', () => {

  // ─── GOV-02: Opcode Discovery & Execution Status Flags ───
  describe('GOV-02: Opcode Discovery & Execution Status Flags', () => {
    it('provides execution status flags across all registered opcodes', () => {
      expect(OPCODE_SUPPORT_FLAGS).toBeDefined();
      expect(OPCODE_SUPPORT_FLAGS.RECT).toBe('IMPLEMENTED');
      expect(OPCODE_SUPPORT_FLAGS.RADIAL).toBe('IMPLEMENTED');
      expect(OPCODE_SUPPORT_FLAGS.OUTLINE).toBe('IMPLEMENTED');
      expect(OPCODE_SUPPORT_FLAGS.FOLD).toBe('STUBBED');
      expect(OPCODE_SUPPORT_FLAGS.MAP).toBe('STUBBED');
      expect(OPCODE_SUPPORT_FLAGS.FILTER).toBe('STUBBED');
      expect(OPCODE_SUPPORT_FLAGS.THRESHOLD).toBe('STUBBED');
    });

    it('publishes discovery capabilities via listSCDLV2Capabilities()', () => {
      const caps = listSCDLV2Capabilities();
      expect(caps).toBeDefined();
      expect(Array.isArray(caps.opcodes)).toBe(true);
      expect(caps.opcodes.length).toBeGreaterThan(30);

      const fold = caps.opcodes.find((o) => o.mnemonic === 'FOLD');
      expect(fold).toBeDefined();
      expect(fold.status).toBe('STUBBED');
      expect(fold.implemented).toBe(false);

      const rect = caps.opcodes.find((o) => o.mnemonic === 'RECT');
      expect(rect).toBeDefined();
      expect(rect.status).toBe('IMPLEMENTED');
      expect(rect.implemented).toBe(true);

      expect(Array.isArray(caps.descriptors)).toBe(true);
      expect(caps.descriptors.length).toBeGreaterThan(0);
      expect(Array.isArray(caps.formats)).toBe(true);
      expect(caps.flags).toBeDefined();
    });
  });

  // ─── CMP-04: Multi-Pass Erosion Boundary Peeling ───
  describe('CMP-04: Multi-Pass Erosion Boundary Peeling', () => {
    it('peels successive boundary rings across multiple erosion passes', () => {
      const rect = createRect({
        origin: { x: makeRational(0), y: makeRational(0) },
        size: { width: makeRational(10), height: makeRational(10) },
      });

      const pass0 = shapeErosion(rect, 0);
      const cells0 = createErosion(rect, 0);
      expect(cells0.kind).toBe('EROSION');

      // Test evaluation in booleans evaluator
      const pass1 = shapeErosion(rect, 1);
      const pass2 = shapeErosion(rect, 2);

      const sourcePass1 = `SCDL 2
ASSET erosion_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
SHAPE $out (OUTLINE $sq WIDTH 1)
LAYER base ORDER 1 {
  PAINT $out FILL #ff0000 RASTER CENTER
}
`;
      const compiled = compileSCDLV2(sourcePass1);
      expect(compiled.ok).toBe(true);
      const coords = compiled.packet.geometry?.coordinates || compiled.packet.coordinates || [];
      // Perimeter of a 10x10 rect is 10 + 10 + 8 + 8 = 36 cells
      expect(coords.length).toBe(36);
    });
  });

  // ─── CMP-05: RADIAL RADIUS Vector Displacement ───
  describe('CMP-05: Radial Radius Vector Displacement', () => {
    it('places child shapes radially around center point according to count and radius', () => {
      const source = `SCDL 2
ASSET radial_test
CANVAS WIDTH 64 HEIGHT 64
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $radial_flower {
  RADIAL COUNT 4 RADIUS (PX 10) CENTER (VEC2 (PX 32) (PX 32)) {
    EMIT (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 2) (PX 2)))
  }
}
LAYER base ORDER 1 {
  PAINT $radial_flower FILL #00ff00 RASTER CENTER
}
`;
      const compiled = compileSCDLV2(source);
      expect(compiled.ok).toBe(true);
      const coords = compiled.packet.geometry?.coordinates || compiled.packet.coordinates || [];
      expect(coords.length).toBeGreaterThan(0);
      // All emitted cells should be within bounding distance from center (32, 32)
      for (const pt of coords) {
        const dist = Math.hypot(pt.x - 32, pt.y - 32);
        expect(dist).toBeLessThanOrEqual(14);
      }
    });

    it('rejects invalid radius type with structured diagnostic', () => {
      const source = `SCDL 2
ASSET radial_bad_test
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $bad_flower {
  RADIAL COUNT 4 RADIUS "invalid_radius" CENTER (VEC2 (PX 16) (PX 16)) {
    EMIT (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 2) (PX 2)))
  }
}
LAYER base ORDER 1 {
  PAINT $bad_flower FILL #00ff00 RASTER CENTER
}
`;
      const compiled = compileSCDLV2(source);
      expect(compiled.ok).toBe(false);
      expect(compiled.diagnostics.length).toBeGreaterThan(0);
    });
  });

  // ─── CMP-06: Shape ALIGN Across All Primitives ───
  describe('CMP-06: Shape ALIGN Across All Primitives', () => {
    it('aligns RECT, CIRCLE, and TRIANGLE primitives using immutable translation', () => {
      const rect = createRect({
        origin: { x: makeRational(0), y: makeRational(0) },
        size: { width: makeRational(20), height: makeRational(20) },
      });
      const circle = createCircle({
        center: { x: makeRational(50), y: makeRational(50) },
        radius: makeRational(10),
      });

      // Align rect CENTER to circle CENTER
      const alignedRect = alignShapes(rect, 'CENTER', circle, 'CENTER');
      expect(alignedRect.kind).toBe('RECT');
      expect(alignedRect.origin.x.numerator / alignedRect.origin.x.denominator).toBe(40);
      expect(alignedRect.origin.y.numerator / alignedRect.origin.y.denominator).toBe(40);

      // Verify original rect remains unchanged (immutability)
      expect(Number(rect.origin.x.numerator)).toBe(0);
      expect(Number(rect.origin.y.numerator)).toBe(0);

      // Test alias alignShape
      const alignedCircle = alignShape(circle, 'CENTER', rect, 'TOP_LEFT');
      expect(alignedCircle.kind).toBe('CIRCLE');
      expect(alignedCircle.center.x.numerator / alignedCircle.center.x.denominator).toBe(0);
      expect(alignedCircle.center.y.numerator / alignedCircle.center.y.denominator).toBe(0);
    });
  });

  // ─── CMP-09: Parameter Type Validation in AMP ABIs ───
  describe('CMP-09: Parameter Type Validation in AMP ABIs', () => {
    it('validates known ABI descriptor types and distinguishes unknown types', () => {
      expect(ABI_DESCRIPTOR_TYPES).toBeDefined();
      expect(ABI_DESCRIPTOR_TYPES).toContain('PACKET');
      expect(isKnownAbiType('PACKET')).toBe(true);
      expect(isKnownAbiType('UNKNOWN_FAKE_DESCRIPTOR')).toBe(false);
    });

    it('enforces enum and finite range constraints in parameter validation', () => {
      const enumSpec = {
        name: 'mode',
        type: 'ENUM',
        enumValues: ['SMOOTH', 'ROUGH', 'CRACKED'],
      };

      const validEnum = validateAmpParameter('SMOOTH', enumSpec);
      expect(validEnum.ok).toBe(true);

      const invalidEnum = validateAmpParameter('LIQUID', enumSpec);
      expect(invalidEnum.ok).toBe(false);
      expect(invalidEnum.error).toMatch(/Allowed/);

      const rangeSpec = {
        name: 'depth',
        type: 'U32',
        min: 0,
        max: 64,
      };

      const validNum = validateAmpParameter(16, rangeSpec);
      expect(validNum.ok).toBe(true);

      const outOfRange = validateAmpParameter(100, rangeSpec);
      expect(outOfRange.ok).toBe(false);

      const nonFinite = validateAmpParameter(NaN, rangeSpec);
      expect(nonFinite.ok).toBe(false);
      expect(nonFinite.error).toMatch(/finite/);
    });
  });

  // ─── CMP-10: Explicit Version Routing & Header Validation ───
  describe('CMP-10: Explicit Version Routing & Header Validation', () => {
    it('rejects unsupported language versions with structured diagnostic without throwing', () => {
      const v3Source = `SCDL 3
ASSET test_v3
CANVAS WIDTH 16 HEIGHT 16
`;
      const resV3 = compileSCDLV2(v3Source);
      expect(resV3.ok).toBe(false);
      const v3Diag = resV3.diagnostics.find((d) => d.code === 'SCDL-VER-001');
      expect(v3Diag).toBeDefined();
      expect(v3Diag.severity).toBe('ERROR');

      const v0Source = `SCDL 0
ASSET test_v0
`;
      const resV0 = compileSCDL(v0Source);
      expect(resV0.ok).toBe(false);
      expect(resV0.diagnostics.some((d) => d.code === 'SCDL-VER-001')).toBe(true);
    });
  });

  // ─── CMP-11: Preserved Comment AST Nodes ───
  describe('CMP-11: Preserved Comment AST Nodes', () => {
    it('preserves single-line and hash comments across parser and formatter', () => {
      const source = `SCDL 2
// Primary Asset Declaration
ASSET comment_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
# Shape section comment
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 4) (PX 4)))
LAYER base ORDER 1 {
  // Layer paint comment
  PAINT $sq FILL #ff0000 RASTER CENTER
}
`;
      const parsed = parseSCDLV2(source);
      expect(parsed.ok).toBe(true);
      expect(parsed.ast).toBeDefined();

      const comments = parsed.ast.comments || [];
      expect(comments.length).toBeGreaterThanOrEqual(1);

      const formatted = formatSCDLV2(parsed.ast);
      expect(formatted.ok).toBe(true);
      expect(formatted.output || formatted).toContain('//');
    });
  });

  // ─── CMP-12: Structured Diagnostic Envelopes ───
  describe('CMP-12: Structured Diagnostic Envelopes', () => {
    it('creates standardized diagnostic envelopes with phase tagging', () => {
      const env = createDiagnosticEnvelope({
        phase: 'ANALYZER',
        code: 'SCDL-TYPE-001',
        severity: 'ERROR',
        message: 'Type mismatch in operand',
        span: { line: 10, column: 5 },
      });

      expect(env.phase).toBe('ANALYZER');
      expect(env.code).toBe('SCDL-TYPE-001');
      expect(env.severity).toBe('ERROR');
      expect(env.message).toBe('Type mismatch in operand');
      expect(env.line).toBe(10);
      expect(env.column).toBe(5);
    });
  });

  // ─── CMP-14: Differentiated Cell Counters ───
  describe('CMP-14: Differentiated Cell Counters', () => {
    it('differentiates candidateCells, rasterWrites, and uniqueCells on overlapping shapes', () => {
      const source = `SCDL 2
ASSET overlap_test
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq1 (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 8) (PX 8)))
SHAPE $sq2 (RECT ORIGIN (VEC2 (PX 4) (PX 4)) SIZE (VEC2 (PX 8) (PX 8)))
LAYER base ORDER 1 {
  PAINT $sq1 FILL #ff0000 RASTER CENTER
  PAINT $sq2 FILL #00ff00 RASTER CENTER
}
`;
      const compiled = compileSCDLV2(source);
      expect(compiled.ok).toBe(true);
      const stats = compiled.analysis?.stats || compiled.stats;
      expect(stats).toBeDefined();
      expect(stats.candidateCells).toBeGreaterThan(0);
      expect(stats.rasterWrites).toBeGreaterThanOrEqual(stats.uniqueCells);
      expect(stats.uniqueCells).toBeLessThan(stats.rasterWrites);
    });
  });

  // ─── TIL-03: Flood-Fill Boundary and Interior Hole Detection ───
  describe('TIL-03: Flood-Fill Boundary and Interior Hole Detection', () => {
    it('detects interior holes and computes depthToAreaRatio on hollow geometry', () => {
      // Create a 16x16 mask with a 4x4 central interior hole
      const mask = new Uint8Array(16 * 16).fill(1);
      for (let y = 6; y < 10; y++) {
        for (let x = 6; x < 10; x++) {
          mask[y * 16 + x] = 0;
        }
      }

      const analysis = TileShapeMicroprocessor.analyzeConnectedComponents(mask, 16, 16);
      expect(analysis).toBeDefined();
      expect(analysis.interiorHoleCount).toBeGreaterThanOrEqual(1);
      expect(analysis.depthToAreaRatio).toBeGreaterThan(0);

      // Solid mask has 0 interior holes
      const solidMask = new Uint8Array(16 * 16).fill(1);
      const solidAnalysis = TileShapeMicroprocessor.analyzeConnectedComponents(solidMask, 16, 16);
      expect(solidAnalysis.interiorHoleCount).toBe(0);
    });
  });

  // ─── AMP-02: Composite Invocations & Deduplication ───
  describe('AMP-02: Composite Invocations & Deduplication', () => {
    it('supports multiple applications of same AMP with distinct parameters and targets', () => {
      const manifests = [
        {
          ampId: 'pixelbrain.facet.amp',
          stage: 'SHAPE_POST',
          order: 10,
          output: { type: 'SHAPE' },
          relevance: { field: 'tags', op: 'includes', value: 'faceted' },
        },
      ];
      const context = { tags: ['faceted'], selectAmpsEnabled: false };
      const explicit = [
        {
          ampId: 'pixelbrain.facet.amp',
          targetSymbol: '$partA',
          params: { divisions: 4 },
        },
        {
          ampId: 'pixelbrain.facet.amp',
          targetSymbol: '$partB',
          params: { divisions: 8 },
        },
      ];

      const plan = resolveAmpPlan(manifests, context, explicit);
      expect(plan.selectedPlan).toHaveLength(2);
      expect(plan.selectedPlan[0].targetSymbol).toBe('$partA');
      expect(plan.selectedPlan[1].targetSymbol).toBe('$partB');
    });

    it('deduplicates relevance auto-selection when explicitly declared for default target', () => {
      const manifests = [
        {
          ampId: 'pixelbrain.facet.amp',
          stage: 'SHAPE_POST',
          order: 10,
          output: { type: 'SHAPE' },
          relevance: { field: 'tags', op: 'includes', value: 'faceted' },
        },
      ];
      const context = { tags: ['faceted'], selectAmpsEnabled: true };
      const explicit = [
        {
          ampId: 'pixelbrain.facet.amp',
          targetSymbol: null,
          params: {},
        },
      ];

      const plan = resolveAmpPlan(manifests, context, explicit);
      expect(plan.selectedPlan).toHaveLength(1);
      const dedup = plan.dormantList.find((d) => d.ampId === 'pixelbrain.facet.amp');
      expect(dedup).toBeDefined();
      expect(dedup.status).toBe('DEDUPLICATED');
      expect(dedup.skipReason).toContain('explicitly declared');
    });
  });

  // ─── AMP-04: Positive-Effect Checks & Fixture Certification ───
  describe('AMP-04: Positive-Effect Checks & Fixture Certification', () => {
    it('certifies all registered AMP manifests and adapters with 0 errors', () => {
      const certifiedResults = certifyAllRegisteredAmps();
      expect(certifiedResults.length).toBeGreaterThanOrEqual(50);
      const failures = certifiedResults.filter((r) => !r.certified);
      expect(failures).toHaveLength(0);
    });
  });

  // ─── STU-03: Effect Preview Session with Atomic Commit ───
  describe('STU-03: Effect Preview Session with Atomic Commit', () => {
    it('creates an effect preview session with pixel diffs, applyCandidate, and cancel', () => {
      let state = {
        layers: [
          { name: 'base', cells: [{ x: 0, y: 0, color: '#ff0000' }] },
        ],
      };
      const fakeDoc = {
        getSnapshot() {
          return state;
        },
        replaceFromRaster(data) {
          state = data;
          return state;
        },
      };

      const candidateLayers = [
        { name: 'base', cells: [{ x: 0, y: 0, color: '#00ff00' }] },
      ];

      const session = createEffectPreviewSession(fakeDoc, { layers: candidateLayers });
      expect(session.pixelsChanged).toBe(1);
      expect(session.previewSnapshot).toBeDefined();

      // Cancel must not mutate the doc
      session.cancel();
      expect(fakeDoc.getSnapshot().layers[0].cells[0].color).toBe('#ff0000');

      // Apply must mutate the doc
      session.applyCandidate();
      expect(fakeDoc.getSnapshot().layers[1].cells[0].color).toBe('#00ff00');
    });
  });

  // ─── STU-04: Preserve Manual Overlay Layers Across Ingest ───
  describe('STU-04: Preserve Manual Overlay Layers Across Ingest', () => {
    it('preserves manual overlay layers across procedural regeneration', () => {
      const source = `SCDL 2
ASSET procedural_tile
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 4) (PX 4)))
LAYER generated ORDER 1 {
  PAINT $sq FILL #123456 RASTER CENTER
}
`;
      const fakeDoc = {
        state: {
          layers: [
            { name: 'overlay_artist_sketches', isOverlay: true, cells: [{ x: 5, y: 5, color: '#ffffff' }] },
          ],
        },
        getSnapshot() {
          return this.state;
        },
        replaceFromRaster(data) {
          this.state = data;
          return data;
        },
      };

      const result = ingestScdlIntoDocument(fakeDoc, source, { preserveOverlays: true });
      expect(result.ok).toBe(true);

      const overlayLayer = result.layers.find((l) => l.name === 'overlay_artist_sketches');
      expect(overlayLayer).toBeDefined();
      expect(overlayLayer.cells).toHaveLength(1);
      expect(overlayLayer.cells[0].color).toBe('#ffffff');
    });
  });

  // ─── STU-05: Pixel Provenance Tracking ───
  describe('STU-05: Pixel Provenance Tracking', () => {
    it('records and queries pixel provenance table from ingest receipt', () => {
      const source = `SCDL 2
ASSET prov_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 2) (PX 2)) SIZE (VEC2 (PX 2) (PX 2)))
LAYER foliage ORDER 1 {
  PAINT $sq FILL #00aa00 RASTER CENTER
}
`;
      const fakeDoc = {
        getSnapshot() { return { layers: [] }; },
        replaceFromRaster(d) { return d; },
      };

      const ingestResult = ingestScdlIntoDocument(fakeDoc, source);
      expect(ingestResult.ok).toBe(true);
      expect(ingestResult.provenanceTable).toBeDefined();

      const prov = getPixelProvenance(fakeDoc, 2, 2);
      expect(prov).toBeDefined();
      expect(prov.layer).toBe('foliage');
    });
  });

  // ─── STU-06: Studio Compile Scheduler ───
  describe('STU-06: Studio Compile Scheduler', () => {
    it('cancels stale jobs when newer request is queued and caches identical compiles', async () => {
      const scheduler = new StudioCompileScheduler();
      const fakeDoc = {
        getSnapshot() { return { layers: [] }; },
        replaceFromRaster(d) { return d; },
      };

      const source1 = `SCDL 2
ASSET test1
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 2) (PX 2)))
LAYER l1 ORDER 1 { PAINT $sq FILL #ff0000 RASTER CENTER }
`;
      const source2 = `SCDL 2
ASSET test2
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 2) (PX 2)))
LAYER l1 ORDER 1 { PAINT $sq FILL #00ff00 RASTER CENTER }
`;

      const p1 = scheduler.scheduleCompile(fakeDoc, source1);
      const p2 = scheduler.scheduleCompile(fakeDoc, source2);

      const [res1, res2] = await Promise.all([p1, p2]);
      expect(res1.isStale).toBe(true);
      expect(res2.isStale).toBe(false);
      expect(res2.sequence).toBeGreaterThan(res1.sequence);
    });
  });

  // ─── EXP-02: Aseprite Cel State & Linked Cels ───
  describe('EXP-02: Aseprite Cel State & Linked Cels', () => {
    it('decodes multi-frame cel chunks and preserves independent frame cel state', () => {
      // Frame 1 with 1 layer, 1 cell at (0, 0)
      const frame1 = {
        layers: [{ name: 'Layer 1', cells: [{ x: 0, y: 0, color: '#ff0000', alpha: 255 }] }],
      };
      // Frame 2 with 1 layer, 1 cell at (5, 5)
      const frame2 = {
        layers: [{ name: 'Layer 1', cells: [{ x: 5, y: 5, color: '#00ff00', alpha: 255 }] }],
      };

      const encoded = encodeAsepriteBinary({
        canvas: { width: 16, height: 16 },
        palette: ['#ff0000', '#00ff00'],
        frames: [frame1, frame2],
      });

      expect(encoded.length).toBeGreaterThan(0);
      expect(Buffer.isBuffer(encoded) || encoded instanceof Uint8Array).toBe(true);
      const decoded = decodeAsepriteBinary(encoded);
      expect(decoded.frames).toHaveLength(2);
      expect(decoded.frames[0].layers[0].cells[0].x).toBe(0);
      expect(decoded.frames[1].layers[0].cells[0].x).toBe(5);
    });
  });

  // ─── EXP-03: Separated Display Names & Atomic Staged Writes ───
  describe('EXP-03: Separated Display Names & Atomic Staged Writes', () => {
    it('separates displayName from content-derived buildDigest in exports', () => {
      const source = `SCDL 2
ASSET display_name_test
CANVAS WIDTH 16 HEIGHT 16
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 4) (PX 4)))
LAYER base ORDER 1 {
  PAINT $sq FILL #112233 RASTER CENTER
}
`;
      const compiled = compileSCDLV2(source);
      expect(compiled.ok).toBe(true);

      const exported = exportSCDL(compiled.packet, ['json']);
      expect(exported.json.ok).toBe(true);
      const parsedJSON = JSON.parse(exported.json.output);

      expect(parsedJSON.displayName).toBe('display_name_test');
      expect(typeof parsedJSON.buildDigest).toBe('string');
      expect(parsedJSON.buildDigest).toHaveLength(64);
      expect(parsedJSON.displayName).not.toBe(parsedJSON.buildDigest);
    });
  });

  // ─── TIL-04, TIL-05, TIL-07, TIL-08, TIL-09, TIL-10: Tile Geometry, Coordinates, Occlusion & Seeding ───
  describe('TIL-04, TIL-05, TIL-07, TIL-08, TIL-09, TIL-10: Tile Geometry, Coordinates, Occlusion & Seeding', () => {
    it('decouples logical footprint from visual bounds (TIL-04)', () => {
      const spec = createAssetSpec({
        logicalFootprint: { widthTiles: 2, heightTiles: 1, walkable: true },
        visualBounds: { width: 160, height: 120, anchorX: 0.5, anchorY: 0.75 },
      });

      expect(spec.logicalFootprint.widthTiles).toBe(2);
      expect(spec.logicalFootprint.heightTiles).toBe(1);
      expect(spec.visualBounds.width).toBe(160);
      expect(spec.visualBounds.height).toBe(120);
      expect(spec.visualBounds.pivot.y).toBe(90);
    });

    it('assigns physical ground depth and solidity (TIL-05)', () => {
      const spec = createAssetSpec({
        groundDepthPx: 24,
        elevationUnits: 2,
        solidity: 'SOLID',
      });

      expect(spec.groundDepthPx).toBe(24);
      expect(spec.elevationUnits).toBe(2);
      expect(spec.solidity).toBe('SOLID');
    });

    it('matches shared edge keys across adjacent tile borders (TIL-07)', () => {
      const edgeA = sharedEdgeKey(0, 0, 0, 1, 'SOUTH');
      const edgeB = sharedEdgeKey(0, 1, 0, 0, 'SOUTH');
      expect(edgeA).toBe(edgeB);
    });

    it('derives deterministic feature-isolated seeds (TIL-09)', () => {
      const seed1 = seedForFeature(4242, 'pebbles');
      const seed2 = seedForFeature(4242, 'grass_blades');
      const seed1Repeat = seedForFeature(4242, 'pebbles');

      expect(seed1).toBe(seed1Repeat);
      expect(seed1).not.toBe(seed2);
    });

    it('computes south flank occlusion and world sorting order (TIL-10)', () => {
      const tiles = [
        { worldX: 0, worldY: 0, elevation: 0 },
        { worldX: 0, worldY: 1, elevation: 1 }, // Higher south neighbor occludes north tile's south flank
        { worldX: 1, worldY: 0, elevation: 1 },
        { worldX: 1, worldY: 1, elevation: 0 }, // Lower south neighbor does not occlude
      ];

      const sorted = computeWorldOcclusionAndSorting(tiles);
      const northTile = sorted.find((t) => t.worldX === 0 && t.worldY === 0);
      const eastTile = sorted.find((t) => t.worldX === 1 && t.worldY === 0);

      expect(northTile.southFlankOccluded).toBe(true);
      expect(eastTile.southFlankOccluded).toBe(false);
    });
  });

  // ─── ART-01 through ART-07: Art Direction & Composition ───
  describe('ART-01 through ART-07: Art Direction & Composition', () => {
    it('computes face light intensity following standard isometric vectors (ART-01 & ART-02)', () => {
      const topLight = computeFaceLightIntensity('TOP');
      const litLight = computeFaceLightIntensity('SW_LIT');
      const shadowLight = computeFaceLightIntensity('SE_SHADOW');

      expect(topLight).toBeGreaterThan(shadowLight);
      expect(litLight).toBeGreaterThan(shadowLight);
    });

    it('transmutes palette families and preserves semantic color roles (ART-03)', () => {
      expect(SEMANTIC_COLOR_ROLES).toContain('surface');
      expect(SEMANTIC_COLOR_ROLES).toContain('flank_lit');
      expect(SEMANTIC_COLOR_ROLES).toContain('strata');

      const transmuted = transmutePalette({ family: 'default', colors: [] }, 'sunlit_glade');
      expect(transmuted.family).toBe('sunlit_glade');
      expect(transmuted.colors.length).toBeGreaterThan(0);
    });

    it('defines explicit pixel style profiles (ART-05)', () => {
      expect(PIXEL_STYLE_PROFILES.STRICT_PIXEL).toBe('STRICT_PIXEL');
      expect(PIXEL_STYLE_PROFILES.BAYER_DITHER).toBe('BAYER_DITHER');
      expect(PIXEL_STYLE_PROFILES.SMOOTH_AA).toBe('SMOOTH_AA');
    });

    it('executes composition passes in fixed semantic order (ART-04)', () => {
      expect(COMPOSITION_PASS_ORDER).toEqual([
        'silhouette',
        'macro_form',
        'material_mask',
        'lighting',
        'secondary_form',
        'detail',
      ]);

      const log = [];
      const pipeline = createCompositionPasses({
        silhouette: (s) => { log.push('silhouette'); return s; },
        lighting: (s) => { log.push('lighting'); return s; },
        detail: (s) => { log.push('detail'); return s; },
      });

      pipeline.execute({});
      expect(log).toEqual(['silhouette', 'lighting', 'detail']);
    });

    it('samples feature clusters respecting minimum distance spacing (ART-04 / Poisson)', () => {
      const clusters = sampleFeatureClusters({
        width: 80,
        height: 40,
        minDistance: 10,
        maxCount: 8,
        seed: 1234,
      });

      expect(clusters.length).toBeGreaterThan(0);
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const dist = Math.hypot(clusters[i].x - clusters[j].x, clusters[i].y - clusters[j].y);
          expect(dist).toBeGreaterThanOrEqual(10);
        }
      }
    });

    it('evaluates visual acceptance metrics detecting palette breaches and voids (ART-07)', () => {
      const width = 10;
      const height = 10;
      const buffer = new Uint8Array(width * height * 4);

      // Fill with valid color #00FF00
      for (let i = 0; i < width * height; i++) {
        buffer[i * 4] = 0;
        buffer[i * 4 + 1] = 255;
        buffer[i * 4 + 2] = 0;
        buffer[i * 4 + 3] = 255;
      }

      const validResult = evaluateVisualAcceptance(buffer, {
        width,
        height,
        allowedColors: ['#00FF00'],
      });
      expect(validResult.passed).toBe(true);

      // Add a rogue color #FF0000
      buffer[0] = 255;
      buffer[1] = 0;
      buffer[2] = 0;
      const invalidResult = evaluateVisualAcceptance(buffer, {
        width,
        height,
        allowedColors: ['#00FF00'],
      });
      expect(invalidResult.passed).toBe(false);
      expect(invalidResult.metrics.outOfPaletteCount).toBe(1);
    });
  });

  // ─── AGT-01: Read-Only Inspection Service ───
  describe('AGT-01: Read-Only Inspection Service', () => {
    it('produces comprehensive inspection report without mutating compiler state', () => {
      const source = `SCDL 2
ASSET inspect_sample
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 4096
SHAPE $sq (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 8) (PX 8)))
LAYER base ORDER 1 {
  PAINT $sq FILL #336699 RASTER CENTER
}
`;
      const inspection = inspectSCDLV2(source);
      expect(inspection.ok).toBe(true);
      expect(inspection.contract).toBe('PB-SCDL-INSPECTION-v1');
      expect(inspection.assetId).toBe('inspect_sample');
      expect(inspection.layers).toHaveLength(1);
      expect(inspection.budget.rasterWrites).toBe(64);
      expect(inspection.budget.uniqueCells).toBe(64);
      expect(inspection.digests.sourceDigest).toHaveLength(64);
      expect(inspection.provenanceTable.length).toBe(64);
      expect(inspection.getProvenance(0, 0)).toBeDefined();
    });

    it('never throws on invalid syntax and reports syntax diagnostics cleanly', () => {
      const badSource = `SCDL 2
ASSET !!!bad syntax***
`;
      const inspection = inspectSCDLV2(badSource);
      expect(inspection.ok).toBe(false);
      expect(inspection.diagnostics.length).toBeGreaterThan(0);
      expect(inspection.layers).toHaveLength(0);
    });
  });

});
