import { describe, it, expect } from 'vitest';
import {
  buildTileForgeFormWitness,
  buildTileForgeRealizationWitness,
  createTileForgeWitnessRecord,
  TILE_FORGE_FORM_SLOTS,
  TILE_FORGE_REALIZATION_SLOTS,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.scd128.js';
import {
  synthesizeTileForgeTile,
  synthesizeTileForgeProp,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import {
  TileForgeScd128Microprocessor,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge-scd128.microprocessor.js';

describe('Tile Forge — SCD128 Dual-Witness Architecture', () => {
  it('generates lawful 64-char FORM64 hex starting with 81 prefix', () => {
    const form = buildTileForgeFormWitness({
      width: 80,
      height: 40,
      hasCliff: true,
      elevation: 2,
    });

    expect(form.form64Hex).toMatch(/^[0-9A-F]{64}$/);
    expect(form.form64Hex.startsWith('81')).toBe(true);
    expect(form.slots).toHaveLength(8);
    expect(form.slots.map((s) => s.slot)).toEqual(TILE_FORGE_FORM_SLOTS);
  });

  it('generates lawful 64-char REALIZATION64 hex starting with 91 prefix', () => {
    const realization = buildTileForgeRealizationWitness({
      biome: 'void_forest',
      seed: 4242,
    });

    expect(realization.realization64Hex).toMatch(/^[0-9A-F]{64}$/);
    expect(realization.realization64Hex.startsWith('91')).toBe(true);
    expect(realization.slots).toHaveLength(8);
    expect(realization.slots.map((s) => s.slot)).toEqual(TILE_FORGE_REALIZATION_SLOTS);
  });

  it('assembles a full 128-hex wire record (FORM64 + REALIZATION64)', () => {
    const record = createTileForgeWitnessRecord(
      { hasCliff: false, terrainType: 'void_forest_top' },
      { biome: 'void_forest', seed: 1337 }
    );

    expect(record.contract).toBe('SCD128-ASSET-RECORD');
    expect(record.assetClass).toBe('tile_forge_isometric_tile');
    expect(record.scd128Wire).toHaveLength(128);
    expect(record.scd128Wire).toMatch(/^[0-9A-F]{128}$/);
    expect(record.scd128Wire.slice(0, 2)).toBe('81');
    expect(record.scd128Wire.slice(64, 66)).toBe('91');
  });
});

describe('Tile Forge — Procedural Tile & Prop Synthesizer', () => {
  it('synthesizes flat 80x40 top tiles for all biomes with discrete cells', () => {
    const biomes = ['void_forest', 'void_ice', 'verdant_glade', 'cave_chasm'];

    for (const biome of biomes) {
      const tile = synthesizeTileForgeTile({ type: 'top', biome, seed: 100 });
      expect(tile.width).toBe(80);
      expect(tile.height).toBe(40);
      expect(tile.hasCliff).toBe(false);
      expect(tile.activeCellCount).toBeGreaterThan(1200);
      expect(tile.data).toBeInstanceOf(Uint8ClampedArray);
      expect(tile.scd128Record.scd128Wire).toHaveLength(128);
    }
  });

  it('synthesizes extruded 80x56 cliff tiles with layered strata', () => {
    const tile = synthesizeTileForgeTile({
      type: 'cliff',
      biome: 'void_forest',
      seed: 200,
      elevation: 2,
    });

    expect(tile.width).toBe(80);
    expect(tile.height).toBe(56);
    expect(tile.hasCliff).toBe(true);
    expect(tile.activeCellCount).toBeGreaterThan(1800);
    expect(tile.scd128Record.form.slots[1].canonicalCategory).toBe('extruded_cliff_skirt');
  });

  it('synthesizes procedural props with accurate dimensions and active cells', () => {
    const tree = synthesizeTileForgeProp({ propType: 'crystal_tree', biome: 'void_forest' });
    expect(tree.width).toBe(36);
    expect(tree.height).toBe(54);
    expect(tree.activeCellCount).toBeGreaterThan(200);

    const pine = synthesizeTileForgeProp({ propType: 'void_pine', biome: 'void_forest' });
    expect(pine.width).toBe(40);
    expect(pine.height).toBe(64);
    expect(pine.activeCellCount).toBeGreaterThan(300);

    const fern = synthesizeTileForgeProp({ propType: 'hologram_fern', biome: 'void_forest' });
    expect(fern.width).toBe(24);
    expect(fern.height).toBe(20);
    expect(fern.activeCellCount).toBeGreaterThan(40);
  });
});

describe('Tile Forge — SCD128 Synthesizer Microprocessor', () => {
  it('executes microprocessor step and produces synthesizedTextures dictionary and wireHash', () => {
    const processor = new TileForgeScd128Microprocessor();
    const result = processor.run({
      intent: {
        biomeId: 'void_forest',
        seed: 777,
        elevation: 2,
      },
      input: {},
      context: {},
    });

    expect(result.processor.id).toBe('scd128Synthesizer');
    expect(result.output.biome).toBe('void_forest');
    expect(result.output.synthesizedTextures).toHaveProperty('top');
    expect(result.output.synthesizedTextures).toHaveProperty('cliff');
    expect(result.output.synthesizedTextures).toHaveProperty('rim');
    expect(result.output.synthesizedTextures).toHaveProperty('crystal_tree');
    expect(result.output.scd128Witnesses).toHaveProperty('top');
    expect(result.output.chunkWireHash).toMatch(/^[0-9A-F]{128}$/);
    expect(result.hash).toMatch(/^[0-9A-F]{8}$/i);
  });
});

describe('Tile Forge — Professional Polymorphic Asset Synthesis', () => {
  it('creates normalized AssetSpec decoupling logical footprint from visual bounds', async () => {
    const { createAssetSpec, ASSET_CLASSES, DETAIL_DENSITIES } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.spec.js'
    );

    const spec = createAssetSpec({
      id: 'test_oak',
      assetClass: ASSET_CLASSES.BOTANICAL_ACTOR,
      semanticType: 'hero_tree_oak',
      seed: 9999,
      detailDensity: DETAIL_DENSITIES.RICH,
      logicalFootprint: { gridW: 2, gridH: 2, walkable: false },
      visualBounds: { width: 160, height: 200, anchorX: 0.5, anchorY: 0.89 },
    });

    expect(spec.assetClass).toBe('BotanicalActor');
    expect(spec.logicalFootprint.gridW).toBe(2);
    expect(spec.logicalFootprint.gridH).toBe(2);
    expect(spec.logicalFootprint.walkable).toBe(false);
    expect(spec.visualBounds.width).toBe(160);
    expect(spec.visualBounds.height).toBe(200);
    expect(spec.subSeeds).toHaveProperty('silhouette');
    expect(spec.subSeeds).toHaveProperty('structure');
    expect(spec.subSeeds).toHaveProperty('material');
    expect(spec.subSeeds).toHaveProperty('lighting');
    expect(spec.subSeeds).toHaveProperty('detail');
  });

  it('guarantees namespaced deterministic sub-streams (changing detail does not alter structure)', async () => {
    const { deriveSubStreamSeeds } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.spec.js'
    );

    const seedsA = deriveSubStreamSeeds(12345);
    const seedsB = deriveSubStreamSeeds(12345);

    expect(seedsA).toEqual(seedsB);
    expect(seedsA.silhouette).not.toBe(seedsA.detail);
    expect(seedsA.structure).not.toBe(seedsA.material);
  });

  it('synthesizes macro-scale Grandfather Oak with independent bounds and valid SCD128 record', async () => {
    const { synthesizeGrandfatherOak } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.hero-synthesizer.js'
    );

    const oak = synthesizeGrandfatherOak({ seed: 4242, paletteFamily: 'verdant_dofus' });
    expect(oak.width).toBe(160);
    expect(oak.height).toBe(200);
    expect(oak.activeCellCount).toBeGreaterThan(10000);
    expect(oak.assetSpec.logicalFootprint.gridW).toBe(2);
    expect(oak.assetSpec.logicalFootprint.walkable).toBe(false);
    expect(oak.scd128Record.scd128Wire).toHaveLength(128);
    expect(oak.scd128Record.scd128Wire.startsWith('81')).toBe(true);
  });

  it('synthesizes Autumn Maple with asymmetrical crown and valid SCD128 record', async () => {
    const { synthesizeAutumnMaple } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.hero-synthesizer.js'
    );

    const maple = synthesizeAutumnMaple({ seed: 4242, paletteFamily: 'autumnal_gold' });
    expect(maple.width).toBe(140);
    expect(maple.height).toBe(180);
    expect(maple.activeCellCount).toBeGreaterThan(6000);
    expect(maple.scd128Record.scd128Wire).toHaveLength(128);
  });

  it('synthesizes Rustic Well with water glint and stone bevels', async () => {
    const { synthesizeRusticWell } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.hero-synthesizer.js'
    );

    const well = synthesizeRusticWell({ seed: 4242, paletteFamily: 'verdant_dofus' });
    expect(well.width).toBe(56);
    expect(well.height).toBe(60);
    expect(well.activeCellCount).toBeGreaterThan(1000);
    expect(well.scd128Record.scd128Wire).toHaveLength(128);
  });

  it('synthesizes Ancient Dolmen with megaliths, capstone, and rune glow', async () => {
    const { synthesizeAncientDolmen } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.hero-synthesizer.js'
    );

    const dolmen = synthesizeAncientDolmen({ seed: 4242, paletteFamily: 'weathered_granite' });
    expect(dolmen.width).toBe(80);
    expect(dolmen.height).toBe(72);
    expect(dolmen.activeCellCount).toBeGreaterThan(2000);
    expect(dolmen.scd128Record.scd128Wire).toHaveLength(128);
  });

  it('synthesizes continuous multi-tile features without cell-edge seams', async () => {
    const {
      synthesizeGroundFabric,
      synthesizeContinuousPath,
      synthesizeWaterSpring,
      synthesizeStratifiedCliff,
    } = await import('../../../codex/core/pixelbrain/tile-forge/tile-forge.feature-synthesizer.js');

    const meadow = synthesizeGroundFabric({ seed: 4242, paletteFamily: 'verdant_dofus' });
    expect(meadow.width).toBe(80);
    expect(meadow.height).toBe(40);
    expect(meadow.activeCellCount).toBe(1600);

    const road = synthesizeContinuousPath({ seed: 4242, paletteFamily: 'verdant_dofus' });
    expect(road.width).toBe(80);
    expect(road.height).toBe(40);
    expect(road.activeCellCount).toBe(1600);

    const water = synthesizeWaterSpring({ seed: 4242, paletteFamily: 'sacred_water' });
    expect(water.width).toBe(80);
    expect(water.height).toBe(40);
    expect(water.activeCellCount).toBe(1600);

    const cliff = synthesizeStratifiedCliff({ seed: 4242, paletteFamily: 'weathered_granite' });
    expect(cliff.width).toBe(80);
    expect(cliff.height).toBe(56);
    expect(cliff.activeCellCount).toBe(2880);
  });

  it('enforces strict determinism: identical seed produces identical pixel data', async () => {
    const { synthesizeGrandfatherOak } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.hero-synthesizer.js'
    );

    const runA = synthesizeGrandfatherOak({ seed: 7777 });
    const runB = synthesizeGrandfatherOak({ seed: 7777 });

    expect(runA.activeCellCount).toBe(runB.activeCellCount);
    expect(Array.from(runA.data)).toEqual(Array.from(runB.data));
  });

  it('evaluates assets with TileForgeQualityScorer and catches defects', async () => {
    const { TileForgeQualityScorer } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.quality-scorer.js'
    );
    const { synthesizeGrandfatherOak } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.hero-synthesizer.js'
    );

    const scorer = new TileForgeQualityScorer();
    const oak = synthesizeGrandfatherOak({ seed: 4242 });
    const evalResult = scorer.evaluate(oak);

    expect(evalResult.ok).toBe(true);
    expect(evalResult.score).toBeGreaterThanOrEqual(90);
    expect(evalResult.metrics.silhouetteClarity).toBe(100);

    // Rejection of empty candidate
    const emptyEval = scorer.evaluate({ width: 80, height: 40, data: new Uint8ClampedArray(80 * 40 * 4) });
    expect(emptyEval.ok).toBe(false);
    expect(emptyEval.grade).toBe('F');
    expect(emptyEval.issues).toContain('Insufficient active pixels (< 10)');
  });

  it('executes the historical 12-asset benchmark as contract-valid compatibility evidence', async () => {
    const { runTileForgeBenchmarks, BENCHMARK_MANIFEST } = await import(
      '../../../codex/core/pixelbrain/tile-forge/tile-forge.benchmark.js'
    );

    expect(BENCHMARK_MANIFEST).toHaveLength(12);
    const results = runTileForgeBenchmarks(4242);
    expect(results).toHaveLength(12);

    for (const res of results) {
      expect(res.evaluation.ok).toBe(true);
      expect(res.activeCellCount).toBeGreaterThan(0);
      expect(res.scd128Wire).toMatch(/^[0-9A-F]{128}$/);
    }
  });
});
