/**
 * Galaxy backdrop PB scene (Compose pilot)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  createGalaxyBackdropScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1 } from '../../../src/core/compose/schema/contracts';

const FIXTURE = join(
  process.cwd(),
  'tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json',
);

describe('Galaxy Backdrop PB scene (compose pilot)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
  });

  it('emits PB-UI-SCENE-v1 with galaxy-plate and storm-overlay children', () => {
    const scene = createGalaxyBackdropScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('galaxy-backdrop');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'galaxy-backdrop.galaxy-plate',
      'galaxy-backdrop.storm-overlay',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('matches golden after canonicalize', () => {
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const emitted = createGalaxyBackdropScene();
    expect(canonicalizePacket(emitted)).toBe(canonicalizePacket(golden));
  });
});
