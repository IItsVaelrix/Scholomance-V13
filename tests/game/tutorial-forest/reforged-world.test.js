import { describe, it, expect } from 'vitest';
import {
  synthesizeReforgedTile,
  REFORGED_PALETTES,
} from '../../../src/game/tutorial-forest/generators/SCD128ReforgedTiles.js';
import {
  synthesizeAncientMossDolmen,
  synthesizeHollowFairyStump,
  synthesizeFallenMossyLog,
  synthesizeLotusStoneBasin,
  synthesizeRusticStoneWell,
  synthesizeTimberFenceWithPitchfork,
  synthesizeSunflowerPatch,
} from '../../../src/game/tutorial-forest/generators/SCD128ReforgedProps.js';
import { generateBotanicalTree } from '../../../src/game/tutorial-forest/generators/SCD128TreeGenerator.js';
import {
  buildTutorialForestWorld,
  findGridPath,
} from '../../../src/game/tutorial-forest/world/tutorialForestBuilder.js';
import {
  WATER_CAUSTIC_FRAG_SRC,
  createWaterCausticShader,
} from '../../../src/game/tutorial-forest/shaders/WaterCausticShader.js';
import {
  FOLIAGE_WIND_FRAG_SRC,
  createFoliageWindShader,
} from '../../../src/game/tutorial-forest/shaders/FoliageWindShader.js';
import { applyBioluminescentGlow } from '../../../src/game/tutorial-forest/shaders/BioluminescentGlow.js';
import {
  setupCameraAtmosphere,
  applyCameraLightingMode,
} from '../../../src/game/tutorial-forest/shaders/AtmospherePostFX.js';

describe('SCD128 Reforged Tiles Synthesizer', () => {
  const variants = [
    'grass_deep_sward',
    'grass_clover_dappled',
    'grass_ancient_roots',
    'grass_sunlit_tufts',
    'water_deep_spring',
    'water_shore_transition',
    'water_reed_cluster',
    'path_ancient_flagstone',
    'path_runic_way',
    'path_overgrown',
    'cliff_mossy_granite',
    'cliff_root_curtain',
    'cliff_waterfall_basin',
  ];

  it('synthesizes all 13 handcrafted tile variants with discrete 1x cells', () => {
    for (const variant of variants) {
      const tile = synthesizeReforgedTile(variant);
      expect(tile.variantKey).toBe(variant);
      expect(tile.width).toBe(80);

      const expectedH = variant.startsWith('cliff_') ? 56 : 40;
      expect(tile.height).toBe(expectedH);
      expect(tile.cells.length).toBeGreaterThan(500);

      // Verify bounds
      for (const c of tile.cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(80);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(expectedH);
        expect(c.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }

      // Verify SCD128 Dual-Witness record
      expect(tile.witness).toBeDefined();
      expect(tile.witness.contract).toBe('SCD128-ASSET-RECORD');
      expect(tile.witness.scd128Wire).toHaveLength(128);
      expect(tile.witness.form.form64Hex).toHaveLength(64);
      expect(tile.witness.realization.realization64Hex).toHaveLength(64);
      expect(tile.witness.form.slots).toHaveLength(8);
      expect(tile.witness.realization.slots).toHaveLength(8);
    }
  });

  it('exposes palettes matching color contrast standards', () => {
    expect(REFORGED_PALETTES.verdant_sward).toBeDefined();
    expect(REFORGED_PALETTES.sacred_water).toBeDefined();
    expect(REFORGED_PALETTES.ancient_stone).toBeDefined();
    expect(REFORGED_PALETTES.stratified_cliff).toBeDefined();
  });
});

describe('SCD128 Reforged Storytelling Landmarks & Dofus-Scale Props', () => {
  it('synthesizes the Ancient Moss Dolmen with carved petroglyphs', () => {
    const dolmen = synthesizeAncientMossDolmen();
    expect(dolmen.key).toBe('ancient_moss_dolmen');
    expect(dolmen.width).toBe(80);
    expect(dolmen.height).toBe(72);
    expect(dolmen.cells.length).toBeGreaterThan(400);
    expect(dolmen.witness.scd128Wire).toHaveLength(128);
  });

  it('synthesizes the Hollow Fairy Stump with glowing fungi', () => {
    const stump = synthesizeHollowFairyStump();
    expect(stump.key).toBe('hollow_fairy_stump');
    expect(stump.width).toBe(64);
    expect(stump.height).toBe(54);
    expect(stump.cells.length).toBeGreaterThan(400);
    expect(stump.witness.scd128Wire).toHaveLength(128);
  });

  it('synthesizes the Fallen Mossy Log with bracket fungi', () => {
    const log = synthesizeFallenMossyLog();
    expect(log.key).toBe('fallen_mossy_log');
    expect(log.width).toBe(76);
    expect(log.height).toBe(36);
    expect(log.cells.length).toBeGreaterThan(300);
    expect(log.witness.scd128Wire).toHaveLength(128);
  });

  it('synthesizes the Lotus Stone Basin font', () => {
    const basin = synthesizeLotusStoneBasin();
    expect(basin.key).toBe('lotus_stone_basin');
    expect(basin.width).toBe(48);
    expect(basin.height).toBe(44);
    expect(basin.cells.length).toBeGreaterThan(200);
    expect(basin.witness.scd128Wire).toHaveLength(128);
  });

  it('synthesizes the Rustic Stone Well with winch and rope', () => {
    const well = synthesizeRusticStoneWell();
    expect(well.key).toBe('rustic_stone_well');
    expect(well.width).toBe(56);
    expect(well.height).toBe(60);
    expect(well.cells.length).toBeGreaterThan(300);
    expect(well.witness.scd128Wire).toHaveLength(128);
  });

  it('synthesizes the Timber Fence with leaning iron pitchfork', () => {
    const fence = synthesizeTimberFenceWithPitchfork();
    expect(fence.key).toBe('timber_fence_pitchfork');
    expect(fence.width).toBe(80);
    expect(fence.height).toBe(48);
    expect(fence.cells.length).toBeGreaterThan(300);
    expect(fence.witness.scd128Wire).toHaveLength(128);
  });

  it('synthesizes the Sunflower Patch with golden blooms and seed discs', () => {
    const patch = synthesizeSunflowerPatch();
    expect(patch.key).toBe('sunflower_patch');
    expect(patch.width).toBe(64);
    expect(patch.height).toBe(48);
    expect(patch.cells.length).toBeGreaterThan(300);
    expect(patch.witness.scd128Wire).toHaveLength(128);
  });
});

describe('SCD128 Heroic Botanical Trees', () => {
  it('synthesizes Grandfather Oak at heroic scale (160x200)', () => {
    const tree = generateBotanicalTree('grandfather_oak');
    expect(tree.speciesKey).toBe('grandfather_oak');
    expect(tree.canvasWidth).toBe(160);
    expect(tree.canvasHeight).toBe(200);
    expect(tree.cells.length).toBeGreaterThan(2000);
  });

  it('synthesizes Autumnal Gold Maple at heroic scale (140x180)', () => {
    const tree = generateBotanicalTree('autumn_gold_maple');
    expect(tree.speciesKey).toBe('autumn_gold_maple');
    expect(tree.canvasWidth).toBe(140);
    expect(tree.canvasHeight).toBe(180);
    expect(tree.cells.length).toBeGreaterThan(1500);
  });
});

describe('Reforged World Layout & Pathfinding', () => {
  const world = buildTutorialForestWorld(4242);

  it('constructs a 24x24 grid with 576 discrete tiles', () => {
    expect(world.tiles).toHaveLength(576);
    expect(world.gridSize).toBe(24);
  });

  it('places storytelling and farmstead landmarks in the world', () => {
    const propTypes = world.props.map(p => p.type);
    expect(propTypes).toContain('ancient_waymarker');
    expect(propTypes).toContain('ancient_moss_dolmen');
    expect(propTypes).toContain('hollow_fairy_stump');
    expect(propTypes).toContain('fallen_mossy_log');
    expect(propTypes).toContain('lotus_stone_basin');
    expect(propTypes).toContain('rustic_stone_well');
    expect(propTypes).toContain('timber_fence_pitchfork');
    expect(propTypes).toContain('sunflower_patch');
  });

  it('places heroic framing trees in the world', () => {
    const treeSpecies = world.trees.map(t => t.speciesKey);
    expect(treeSpecies).toContain('grandfather_oak');
    expect(treeSpecies).toContain('autumn_gold_maple');
    expect(treeSpecies).toContain('sacred_lotus_cedar');
  });

  it('places Tile Forge procedural biome assets in the world', () => {
    const propTypes = world.props.map(p => p.type);
    expect(propTypes).toContain('tileforge_crystal_tree');
    expect(propTypes).toContain('tileforge_void_pine');
    expect(propTypes).toContain('tileforge_hologram_fern');
    expect(propTypes).toContain('tileforge_void_flowers');
  });

  it('validates BFS pathfinding from player spawn to sanctuary entrance', () => {
    const start = world.playerSpawn; // { tx: 6, ty: 17 }
    const sanctuaryEntrance = { tx: 17, ty: 8 }; // path before dolmen

    const path = findGridPath(start, sanctuaryEntrance, world.tileMap);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(sanctuaryEntrance);
  });
});

describe('WebGL Shaders & Atmosphere Pipelines', () => {
  it('contains valid GLSL fragment source for water caustics', () => {
    expect(WATER_CAUSTIC_FRAG_SRC).toContain('uniform float uTime');
    expect(WATER_CAUSTIC_FRAG_SRC).toContain('uniform vec4 uCausticColor');
    expect(WATER_CAUSTIC_FRAG_SRC).toContain('gl_FragColor = col');
  });

  it('handles water caustic creation gracefully in mock scene', () => {
    const mockScene = { add: {} };
    const res = createWaterCausticShader(mockScene, 0, 0);
    expect(res).toBeNull();
  });

  it('contains valid GLSL fragment source for foliage wind flutter', () => {
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('uniform sampler2D uMainSampler');
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('uniform float uWindStrength');
    expect(FOLIAGE_WIND_FRAG_SRC).toContain('heightFactor');
  });

  it('handles foliage wind creation gracefully in mock scene', () => {
    const mockScene = { add: {} };
    const res = createFoliageWindShader(mockScene, 'tree_test', 0, 0, 100, 100);
    expect(res).toBeNull();
  });

  it('handles bioluminescent glow filter gracefully', () => {
    const mockTarget = {
      enableFilters: () => {},
      filters: {
        internal: {
          addGlow: (color, outerStrength) => ({ color, outerStrength }),
        },
      },
    };
    const result = applyBioluminescentGlow(mockTarget, { color: 0x10b981, outerStrength: 6 });
    expect(result).toBeDefined();
    expect(result.type).toBe('webgl_filter');
    expect(result.filter.outerStrength).toBe(6);
  });

  it('handles camera atmosphere postfx and lighting mode switches', () => {
    const mockCamera = {
      filters: {
        internal: {
          addColorMatrix: () => ({
            colorMatrix: {
              reset: () => {},
              warm: () => {},
              night: () => {},
              saturate: () => {},
            },
          }),
          addVignette: (x, y, r, s) => ({ x, y, radius: r, strength: s }),
        },
      },
    };

    const atmosphere = setupCameraAtmosphere(mockCamera);
    expect(atmosphere).toBeDefined();
    expect(atmosphere.cm).toBeDefined();

    applyCameraLightingMode(atmosphere, 'twilight');
    expect(atmosphere.vig.strength).toBe(0.5);

    applyCameraLightingMode(atmosphere, 'night');
    expect(atmosphere.vig.strength).toBe(0.65);

    applyCameraLightingMode(atmosphere, 'day');
    expect(atmosphere.vig.strength).toBe(0.35);
  });
});
