/**
 * Tile Forge — Ground & Soil Fullness Architecture Test Suite
 *
 * Validates the volumetric tile shape microprocessor, the soil/dirt AMP adapter,
 * authoritative SCDL V2 compilation with ground_soil layer, and discrete procedural
 * ground tile synthesis.
 */

import { describe, it, expect } from 'vitest';
import { TileShapeMicroprocessor } from '../../../codex/core/pixelbrain/amps/geometry/processors/tile-shape.microprocessor.js';
import { SoilAdapter } from '../../../codex/core/pixelbrain/scdl/v2/adapters/soil.adapter.js';
import { getAmpManifest, getAmpAdapter } from '../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';
import {
  generateTileGroundScdl,
  generateTileDiamondScdl,
  compileTileForgeScdl,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.scdl-generator.js';
import { synthesizeTileForgeTile } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import { TileForgeScd128Microprocessor } from '../../../codex/core/pixelbrain/tile-forge/tile-forge-scd128.microprocessor.js';
import { compileSCDLV2 } from '../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';

describe('Tile Forge — TileShapeMicroprocessor (Volumetric Prism Architecture)', () => {
  it('instantiates with standard metadata and default dimensions', () => {
    const processor = new TileShapeMicroprocessor();
    expect(processor.id).toBe('tileShape');
    expect(processor.version).toBe('1.0.0');
  });

  it('computes top diamond, lit SW/SE ground faces, prow, and bedrock floor', () => {
    const processor = new TileShapeMicroprocessor();
    const result = processor.run({
      intent: {
        width: 80,
        height: 40,
        groundDepth: 16,
      },
    });

    expect(result.processor.id).toBe('tileShape');
    expect(result.output).toBeDefined();

    const {
      topPlane,
      leftGroundPlane,
      rightGroundPlane,
      floorCells,
      prowRidgeCells,
      sodFringeAnchors,
      metrics,
    } = result.output;

    // Top diamond plane
    expect(topPlane.length).toBeGreaterThan(500);

    // Ground flank faces
    expect(leftGroundPlane.length).toBeGreaterThan(200);
    expect(rightGroundPlane.length).toBeGreaterThan(200);
    expect(floorCells.length).toBe(80);

    // Flank points contain facing and depthRatio
    const sampleLeft = leftGroundPlane[0];
    expect(sampleLeft.face).toBe('ground_left');
    expect(sampleLeft.depthRatio).toBeGreaterThanOrEqual(0);
    expect(sampleLeft.depthRatio).toBeLessThanOrEqual(1);

    const sampleRight = rightGroundPlane[0];
    expect(sampleRight.face).toBe('ground_right');

    // Prow ridge along the forward apex
    expect(prowRidgeCells.length).toBe(16);

    // Bedrock floor edge
    expect(floorCells.length).toBe(80);

    // Sod fringe overhang anchors
    expect(sodFringeAnchors.length).toBeGreaterThan(50);
    expect(sodFringeAnchors[0]).toHaveProperty('flank');

    // Fullness metrics
    expect(metrics.fullnessRatio).toBeGreaterThan(0.3);
    expect(metrics.totalGroundCells).toBe(leftGroundPlane.length + rightGroundPlane.length);
    expect(metrics.totalTileCells).toBe(metrics.topCellCount + metrics.totalGroundCells);

    // Stable 8-char hex hash
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/i);
  });
});

describe('Tile Forge — Soil / Dirt AMP Adapter (PB-AMP-ABI-v1)', () => {
  it('manifest catalog resolves pixelbrain.soil and pixelbrain.dirt', () => {
    const soilManifest = getAmpManifest('pixelbrain.soil');
    expect(soilManifest).toBeDefined();
    expect(soilManifest.ampId).toBe('pixelbrain.soil');
    expect(soilManifest.contract).toBe('PB-AMP-ABI-v1');

    const dirtManifest = getAmpManifest('pixelbrain.dirt');
    expect(dirtManifest).toBeDefined();
    expect(dirtManifest.ampId).toBe('pixelbrain.dirt');

    const adapter = getAmpAdapter('pixelbrain.soil');
    expect(adapter).toBeDefined();
  });

  it('SoilAdapter executes and produces lawful PB-WORLD-DESCRIPTOR-v1 of kind SOIL', () => {
    const adapter = new SoilAdapter();
    const result = adapter.execute({}, {
      depth: 16,
      soilType: 'void_loam',
      pebbleDensity: 0.3,
      rootDensity: 0.2,
      moisture: 0.5,
      bedrock: true,
    });

    expect(result.contract).toBe('PB-WORLD-DESCRIPTOR-v1');
    expect(result.kind).toBe('SOIL');
    expect(result.depth).toBe(16);
    expect(result.soilType).toBe('void_loam');
    expect(result.pebbleCount).toBeGreaterThan(0);
    expect(result.rootCount).toBeGreaterThan(0);
    expect(result.swatchRamp).toHaveProperty('soil_dark');
    expect(result.swatchRamp).toHaveProperty('soil_mid');
    expect(result.swatchRamp).toHaveProperty('soil_lit');
  });
});

describe('Tile Forge — Authoritative SCDL V2 Ground Generator', () => {
  it('generates valid SCDL V2 with pixelbrain.soil AMP and ground_soil layer', () => {
    const scdl = generateTileGroundScdl({
      biome: 'void_forest',
      seed: 4242,
      groundDepth: 16,
      elevation: 2,
    });

    // Contains soil AMP
    expect(scdl).toContain('AMP pixelbrain.soil');
    expect(scdl).toContain('AMP pixelbrain.iso-tile-geometry');

    // Contains ground palette swatches
    expect(scdl).toContain('$soil_dark');
    expect(scdl).toContain('$soil_mid');
    expect(scdl).toContain('$soil_lit');
    expect(scdl).toContain('$soil_hi');
    expect(scdl).toContain('$soil_pebble');

    // Emits ground_soil layer with lower order than top sod teeth
    expect(scdl).toContain('LAYER ground_soil ORDER 8');
    expect(scdl).toContain('LAYER ground_base ORDER 10');
    expect(scdl).toContain('LAYER ground_surface_clusters ORDER 30');

    // Ground shapes
    expect(scdl).toContain('$soil_sw1');
    expect(scdl).toContain('$soil_se1');
    expect(scdl).toContain('$bedrock_floor_sw');
    expect(scdl).toContain('$soil_prow');

    // Dimensions 80x56
    expect(scdl).toContain('CANVAS WIDTH 80 HEIGHT 56');
  });

  it('compiles generateTileGroundScdl cleanly through compileSCDLV2', () => {
    const scdl = generateTileGroundScdl({
      biome: 'verdant_glade',
      seed: 1234,
      groundDepth: 16,
    });

    const compiled = compileSCDLV2(scdl);
    expect(compiled.ok).toBe(true);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.package.construction.layers.some((l) => l.id === 'ground_soil')).toBe(true);
  });

  it('compileTileForgeScdl compiles ground tile cleanly', () => {
    const scdl = generateTileGroundScdl({
      biome: 'void_ice',
      seed: 9999,
      groundDepth: 16,
    });

    const compiled = compileTileForgeScdl(scdl, {
      assetClass: 'ground',
      biome: 'void_ice',
      seed: 9999,
    });

    expect(compiled.ok).toBe(true);
    expect(compiled.height).toBe(56);
    expect(compiled.ampDescriptors.some((a) => a.kind === 'SOIL')).toBe(true);
  });
});

describe('Tile Forge — Procedural Ground Tile Synthesis', () => {
  it('synthesizes full 80x56 ground tile with dirt flank underneath sod teeth', () => {
    const groundTile = synthesizeTileForgeTile({
      type: 'ground',
      biome: 'void_forest',
      seed: 777,
      elevation: 2,
    });

    expect(groundTile.width).toBe(80);
    expect(groundTile.height).toBe(56);
    expect(groundTile.type).toBe('ground');
    expect(groundTile.hasGround).toBe(true);
    expect(groundTile.groundDepth).toBe(16);

    // Verify active cells in the lower dirt region (y >= 40)
    const lowerDirtCells = groundTile.cells.filter((c) => c.y >= 40);
    expect(lowerDirtCells.length).toBeGreaterThan(150);

    // Scd128 witness
    expect(groundTile.scd128Record).toBeDefined();
    expect(groundTile.scd128Record.form.form64Hex).toMatch(/^81/);
    expect(groundTile.scd128Record.realization.realization64Hex).toMatch(/^91/);
    expect(groundTile.scd128Record.scd128Wire).toHaveLength(128);

    // Attached AMP descriptors
    expect(groundTile.ampDescriptors.length).toBeGreaterThanOrEqual(2);
    const soilAmp = groundTile.ampDescriptors.find((a) => a.kind === 'SOIL');
    expect(soilAmp).toBeDefined();
    expect(soilAmp.kind).toBe('SOIL');

    // Buffer validation
    expect(typeof groundTile.toCanvas).toBe('function');
    expect(groundTile.data).toBeInstanceOf(Uint8ClampedArray);
    expect(groundTile.data.length).toBe(80 * 56 * 4);
  });

  it('synthesizes flat 80x40 top cap when type is top for backwards compatibility', () => {
    const topTile = synthesizeTileForgeTile({
      type: 'top',
      biome: 'void_forest',
      seed: 777,
    });

    expect(topTile.width).toBe(80);
    expect(topTile.height).toBe(40);
    expect(topTile.hasGround).toBe(false);
  });
});

describe('Tile Forge — SCD128 Synthesizer Integration', () => {
  it('includes ground tile in synthesizedTextures, scd128Witnesses, and scdlPrograms', () => {
    const processor = new TileForgeScd128Microprocessor();
    const result = processor.run({
      intent: {
        biomeId: 'scholomance_sunlit_glade',
        seed: 888,
        elevation: 1,
      },
      input: {},
      context: {},
    });

    expect(result.output.synthesizedTextures).toHaveProperty('ground');
    expect(result.output.synthesizedTextures.ground.height).toBe(56);
    expect(result.output.scd128Witnesses).toHaveProperty('ground');
    expect(result.output.scdlPrograms).toHaveProperty('ground');
    expect(result.output.scdlPrograms.ground).toContain('AMP pixelbrain.soil');
    expect(result.diagnostics.metrics.tilesSynthesized).toBe(4);

    // Soil amp is in allAmps
    const hasSoilAmp = result.output.ampDescriptors.some(
      (a) => a.kind === 'SOIL'
    );
    expect(hasSoilAmp).toBe(true);
  });
});
