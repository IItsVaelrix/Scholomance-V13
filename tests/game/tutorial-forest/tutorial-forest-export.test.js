import { describe, expect, it } from 'vitest';

import {
  composeTutorialForestVisual,
  parseTutorialForestExportArgs,
  scaleNearestNeighbor,
} from '../../../scripts/export-tutorial-forest-visuals.mjs';
import { forgeTutorialForestEnvironment } from '../../../src/game/tutorial-forest/generators/TutorialForestForgeAdapter.js';
import { buildTutorialForestWorld } from '../../../src/game/tutorial-forest/world/tutorialForestBuilder.js';

describe('Tutorial Forest visual evidence exporter', () => {
  it('catches ignored CLI seed, output, and integer-scale arguments', () => {
    expect(parseTutorialForestExportArgs([
      '--seed', '8118',
      '--scale', '3',
      '--out', '/tmp/tutorial-forest-evidence',
    ])).toEqual({
      seed: 8118,
      scale: 3,
      outDir: '/tmp/tutorial-forest-evidence',
    });
    expect(() => parseTutorialForestExportArgs(['--scale', '1.5'])).toThrow(/positive integer/i);
  });

  it('catches the exporter drifting from the runtime Forge adapter', async () => {
    const runtime = forgeTutorialForestEnvironment(buildTutorialForestWorld(4242), { seed: 4242 });
    const composite = await composeTutorialForestVisual({ seed: 4242 });

    expect(composite.groundRealizationHash).toBe(runtime.ground.realizationHash);
    expect(composite.width).toBeGreaterThan(runtime.ground.width);
    expect(composite.height).toBeGreaterThan(runtime.ground.height);
    expect(composite.data).toBeInstanceOf(Uint8ClampedArray);
    expect(composite.quality.grade).toBe('A');
  });

  it('catches smoothed or non-integer evidence scaling', () => {
    const source = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
    ]);
    const scaled = scaleNearestNeighbor(source, 2, 1, 2);

    expect(Array.from(scaled)).toEqual([
      10, 20, 30, 255, 10, 20, 30, 255,
      40, 50, 60, 255, 40, 50, 60, 255,
      10, 20, 30, 255, 10, 20, 30, 255,
      40, 50, 60, 255, 40, 50, 60, 255,
    ]);
  });
});
