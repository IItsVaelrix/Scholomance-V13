import { describe, expect, it } from 'vitest';

import {
  TILE_FORGE_FOREST_ACTOR_TYPES,
  TILE_FORGE_DECOR_TYPES,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.forest-actor-synthesizer.js';
import {
  compileTutorialForestForgePlan,
  forgeTutorialForestEnvironment,
} from '../../../src/game/tutorial-forest/generators/TutorialForestForgeAdapter.js';
import {
  buildTutorialForestWorld,
  findGridPath,
} from '../../../src/game/tutorial-forest/world/tutorialForestBuilder.js';

describe('Tutorial Forest Forge adapter', () => {
  it('catches visual planning changing gameplay world invariants', () => {
    const world = buildTutorialForestWorld(4242);

    expect(world.seed).toBe(4242);
    expect(world.gridSize).toBe(24);
    expect(world.tiles).toHaveLength(576);
    expect(world.playerSpawn).toEqual({ tx: 6, ty: 17 });
    expect(world.trees).toHaveLength(24);
    expect(world.props).toHaveLength(18);
    expect(world.waterTiles).toHaveLength(34);
    expect(findGridPath(world.playerSpawn, { tx: 17, ty: 8 }, world.tileMap)).toHaveLength(20);
  });

  it('catches the Forge plan losing the approved concept relationships', () => {
    const world = buildTutorialForestWorld(4242);
    const plan = compileTutorialForestForgePlan(world, { seed: 4242 });

    expect(plan.contract).toBe('PB-TUTORIAL-FOREST-FORGE-PLAN-v1');
    expect(plan.regionSpec.gridWidth).toBe(24);
    expect(plan.regionSpec.gridHeight).toBe(24);
    expect(plan.composition.quietMeadow.cellCount).toBeGreaterThan(100);
    expect(plan.composition.path.crossesCenter).toBe(true);
    expect(plan.composition.pond.side).toBe('right');
    expect(plan.composition.pond.overlapsSpawn).toBe(false);
    expect(plan.composition.sanctuary.quadrant).toBe('upper-right');
    expect(plan.composition.sanctuary.maximumElevation)
      .toBeGreaterThan(plan.composition.quietMeadow.maximumElevation);
    expect(plan.composition.farmstead.quadrant).toBe('upper-left');
    expect(plan.composition.foreground.types).toContain('fallen_log');
    expect(plan.composition.canopyRing.openCenterRatio).toBeGreaterThan(0.9);
    expect(plan.actors.every(({ semanticType }) => (
      TILE_FORGE_FOREST_ACTOR_TYPES.includes(semanticType)
      || TILE_FORGE_DECOR_TYPES.includes(semanticType)
    ))).toBe(true);
    // Decor is pure illustration: it must never become an inspectable/blocking actor.
    const decor = plan.actors.filter(({ semanticType }) => (
      TILE_FORGE_DECOR_TYPES.includes(semanticType)
    ));
    expect(decor.length).toBeGreaterThan(40);
    expect(decor.every(({ interactive }) => interactive === false)).toBe(true);
    const stump = plan.actors.find(({ sourceType }) => sourceType === 'hollow_fairy_stump');
    expect(stump.description).toMatch(/bioluminescent fairy mushrooms/i);
    expect(stump.scd128Record.contract).toBe('SCD128-ASSET-RECORD');
  });

  it('catches adapter nondeterminism between gameplay and Forge outputs', () => {
    const world = buildTutorialForestWorld(4242);
    const first = forgeTutorialForestEnvironment(world, { seed: 4242 });
    const second = forgeTutorialForestEnvironment(world, { seed: 4242 });

    expect(first.ground.realizationHash).toBe(second.ground.realizationHash);
    expect(first.ground.textureKey).toBe(second.ground.textureKey);
    expect(first.quality.hardFailures).toEqual([]);
    expect(first.quality.grade).toBe('A');
    expect(first.actors.map(({ asset }) => asset.realizationHash))
      .toEqual(second.actors.map(({ asset }) => asset.realizationHash));
  });

  it('catches saplings and decor boulders missing collision hitboxes', () => {
    const world = buildTutorialForestWorld(4242);

    // Sunlit young saplings are visible trees with trunks — they must block.
    const saplingPositions = [
      { tx: 5, ty: 14 }, { tx: 14, ty: 15 },
      { tx: 4, ty: 19 }, { tx: 13, ty: 17 },
    ];
    for (const pos of saplingPositions) {
      const tile = world.tileMap.get(`${pos.tx},${pos.ty}`);
      expect(tile.walkable, `sapling at (${pos.tx},${pos.ty}) must block`).toBe(false);
    }

    // Decor boulders on walkable ground must block movement.
    const boulderPositions = [
      { tx: 4, ty: 10 }, { tx: 19, ty: 14 }, { tx: 13, ty: 15 },
    ];
    for (const pos of boulderPositions) {
      const tile = world.tileMap.get(`${pos.tx},${pos.ty}`);
      expect(tile.walkable, `boulder at (${pos.tx},${pos.ty}) must block`).toBe(false);
    }

    // Path from spawn to sanctuary must remain navigable despite new obstacles.
    expect(findGridPath(world.playerSpawn, { tx: 17, ty: 8 }, world.tileMap).length).toBe(20);
  });
});
