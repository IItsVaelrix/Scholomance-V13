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
import {
  createWindField,
  sampleWindShear,
} from '../../../src/game/tutorial-forest/world/windField.js';
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
    expect(WATER_CAUSTIC_FRAG_SRC).toContain('uniform sampler2D uGhostSampler');
    expect(WATER_CAUSTIC_FRAG_SRC).toContain('vec3 premult');
  });

  it('handles water caustic creation gracefully in mock scene', () => {
    const mockScene = { add: {} };
    const res = createWaterCausticShader(mockScene, 0, 0);
    expect(res).toBeNull();
  });

  it('catches caustics regressing to cached-string configs or misnamed uniforms', () => {
    // Phaser 4 matches uniforms to GLSL by exact name and only refreshes them
    // through the per-render setupUniforms callback; a cached raw string or a
    // `name.value` key silently disables the effect.
    const captured = [];
    const mockShader = { setOrigin: () => mockShader };
    const mockScene = {
      time: { now: 0 },
      add: {
        shader: (config, x, y, w, h, textures) => {
          captured.push({ config, x, y, w, h, textures });
          return mockShader;
        },
      },
    };

    const shader = createWaterCausticShader(mockScene, 12, 34, 80, 40);
    expect(shader).toBe(mockShader);
    expect(captured).toHaveLength(1);
    expect(captured[0].config.fragmentSource).toBe(WATER_CAUSTIC_FRAG_SRC);
    expect(captured[0].config.fragmentKey).toBeUndefined();
    expect(typeof captured[0].config.setupUniforms).toBe('function');

    const uniforms = {};
    captured[0].config.setupUniforms((name, value) => {
      expect(name).not.toContain('.value');
      uniforms[name] = value;
    });
    expect(Object.keys(uniforms)).toEqual(
      expect.arrayContaining(['uTime', 'uWaterBase', 'uCausticColor', 'uResolution', 'uHasMask']),
    );
    expect(uniforms.uWaterBase).toHaveLength(4);
    expect(uniforms.uResolution).toEqual([80, 40]);
    // No mask texture => field runs unmasked rather than leaking a bare quad.
    expect(uniforms.uHasMask).toBe(0.0);

    // With a mask texture the field meshes to the water silhouette pixel-by-pixel.
    const masked = [];
    createWaterCausticShader(mockScene, 0, 0, 1920, 960, 'water-mask');
    // first capture was the unmasked call; the masked one is the second
    expect(captured).toHaveLength(2);
    // unit 0 = water silhouette mask, unit 1 = mirror ghost (placeholder until
    // the scene binds the player's current frame)
    expect(captured[1].textures).toEqual(['water-mask', '__DEFAULT']);
    captured[1].config.setupUniforms((name, value) => { masked[name] = value; });
    expect(masked.uHasMask).toBe(1.0);
    expect(masked.uResolution).toEqual([1920, 960]);

    // Stepped animation: time advances in discrete states, not per-frame floats.
    mockScene.time.now = 100;
    captured[0].config.setupUniforms((name, value) => { uniforms[name] = value; });
    const firstStep = uniforms.uTime;
    mockScene.time.now = 1000;
    captured[0].config.setupUniforms((name, value) => { uniforms[name] = value; });
    expect(uniforms.uTime).not.toBe(firstStep);
  });

  it('catches foliage wind regressing to cached-string configs or misnamed uniforms', () => {
    const captured = [];
    const mockShader = { setOrigin: () => mockShader };
    const mockScene = {
      time: { now: 0 },
      windEnabled: true,
      // One shared field drives every canopy; the shader samples it per render.
      windField: createWindField({ direction: 'WEST' }),
      add: {
        shader: (config, x, y, w, h, textures) => {
          captured.push({ config, textures });
          return mockShader;
        },
      },
    };

    const shader = createFoliageWindShader(mockScene, 'tree_oak', 4, 5, 160, 200, { tx: 3, ty: 7 });
    expect(shader).toBe(mockShader);
    expect(captured[0].config.fragmentSource).toBe(FOLIAGE_WIND_FRAG_SRC);
    expect(captured[0].textures).toEqual(['tree_oak']);

    const uniforms = {};
    captured[0].config.setupUniforms((name, value) => {
      expect(name).not.toContain('.value');
      uniforms[name] = value;
    });
    expect(Object.keys(uniforms)).toEqual(
      expect.arrayContaining(['uMainSampler', 'uTime', 'uWindStrength', 'uWindLean']),
    );
    expect(uniforms.uWindStrength).toBe(1.0);
    // The lean is sourced from the shared field, not a per-tree oscillator phase.
    expect(uniforms.uWindLean).toBeCloseTo(
      sampleWindShear(mockScene.windField, 0, 3, 7, 160),
      10,
    );
    // A west wind pushes every crown left, so the shear is negative.
    expect(uniforms.uWindLean).toBeLessThan(0);
    expect(FOLIAGE_WIND_FRAG_SRC).not.toContain('uPhase');
  });

  it('gives every tree the same wind direction from the shared field', () => {
    const capturedConfigs = [];
    const mockScene = {
      time: { now: 1500 },
      windEnabled: true,
      windField: createWindField({ direction: 'EAST' }),
      add: { shader: (config) => { capturedConfigs.push(config); return { setOrigin: () => null }; } },
    };

    // Two trees far apart on the map, sampled at the same instant.
    for (const tile of [{ tx: 0, ty: 0 }, { tx: 20, ty: 16 }]) {
      createFoliageWindShader(mockScene, 'tree_oak', 0, 0, 160, 200, tile);
    }

    const leans = capturedConfigs.map((config) => {
      let lean = null;
      config.setupUniforms((name, value) => { if (name === 'uWindLean') lean = value; });
      return lean;
    });

    // An east wind leans every crown right, regardless of tile position.
    expect(leans.every((lean) => lean > 0)).toBe(true);
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
