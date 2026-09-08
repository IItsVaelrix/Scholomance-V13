import { describe, expect, it } from 'vitest';

import {
  TILE_FORGE_FOREST_ACTOR_TYPES,
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
    ))).toBe(true);
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
});
