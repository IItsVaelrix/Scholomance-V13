import { describe, it, expect } from 'vitest';
import { generateGrassTile } from '../../../src/game/tutorial-forest/generators/SCD128GrassGenerator.js';
import { generateBotanicalTree } from '../../../src/game/tutorial-forest/generators/SCD128TreeGenerator.js';
import {
  generateLotusWaterTile,
  generateLilypadProp,
  generateSacredLotusBloom,
} from '../../../src/game/tutorial-forest/generators/SCD128LotusGenerator.js';
import { generatePathTile } from '../../../src/game/tutorial-forest/generators/SCD128PathGenerator.js';
import {
  buildTutorialForestWorld,
  findGridPath,
} from '../../../src/game/tutorial-forest/world/tutorialForestBuilder.js';

describe('Tutorial Forest — Procedural Asset Generators', () => {
  it('generates 80x40 isometric grass diamond tiles with discrete cells', () => {
    const tile = generateGrassTile({ variant: 'glade_lush', paletteKey: 'verdant_glade' });
    expect(tile.width).toBe(80);
    expect(tile.height).toBe(40);
    expect(tile.cells.length).toBeGreaterThan(1000);

    for (const c of tile.cells) {
      expect(Number.isInteger(c.x)).toBe(true);
      expect(Number.isInteger(c.y)).toBe(true);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(80);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(40);
    }
  });

  it('generates grass tiles with extruded cliff faces', () => {
    const tile = generateGrassTile({ variant: 'glade_cliff', hasCliff: true, cliffHeight: 24 });
    expect(tile.width).toBe(80);
    expect(tile.height).toBe(64);
    expect(tile.cells.length).toBeGreaterThan(1800);
  });

  it('generates botanical trees adhering to the Anti-Vector Invariant', () => {
    const oak = generateBotanicalTree('ancient_moss_oak');
    expect(oak.canvasWidth).toBe(56);
    expect(oak.canvasHeight).toBe(72);
    expect(oak.cells.length).toBeGreaterThan(1200);

    const cedar = generateBotanicalTree('sacred_lotus_cedar');
    expect(cedar.canvasWidth).toBe(48);
    expect(cedar.canvasHeight).toBe(64);
    expect(cedar.cells.length).toBeGreaterThan(800);
  });

  it('generates animated water tiles and sacred lotus blossoms', () => {
    const water = generateLotusWaterTile({ frame: 0 });
    expect(water.width).toBe(80);
    expect(water.height).toBe(40);
    expect(water.cells.length).toBeGreaterThan(1000);

    const pad = generateLilypadProp();
    expect(pad.cells.length).toBeGreaterThan(150);

    const bloom = generateSacredLotusBloom({ pulsePhase: 0 });
    expect(bloom.cells.length).toBeGreaterThan(100);
  });

  it('generates cobblestone trail tiles', () => {
    const path = generatePathTile();
    expect(path.width).toBe(80);
    expect(path.height).toBe(40);
    expect(path.cells.length).toBeGreaterThan(1000);
  });

  it('compiles 24x24 tutorial forest world and verifies BFS pathfinding to sanctuary', () => {
    const world = buildTutorialForestWorld(4242);
    expect(world.tiles).toHaveLength(24 * 24);
    expect(world.trees.length).toBeGreaterThan(20);
    expect(world.waterTiles.length).toBeGreaterThan(10);

    // Verify pathfinding from spawn glade (6, 17) to waypoint along path
    const spawn = world.playerSpawn;
    const target = { tx: 10, ty: 12 };
    const path = findGridPath(spawn, target, world.tileMap);

    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(target);
  });
});
