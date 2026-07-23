// tests/qa/features/compose-read-chrome-packet.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  createReadTopBarScene,
  createReadStatusBarScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1 } from '../../../src/core/compose/schema/contracts';

const TOP_FIXTURE = join(process.cwd(), 'tests/qa/features/fixtures/read-top-bar.pb-ui-scene.v1.json');
const STATUS_FIXTURE = join(process.cwd(), 'tests/qa/features/fixtures/read-status-bar.pb-ui-scene.v1.json');

describe('Read chrome PB scenes (compose pilot)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
  });

  it('emits PB-UI-SCENE-v1 top bar with identity/progression/actions children', () => {
    const scene = createReadTopBarScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('read-top-bar');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'read-top-bar.identity',
      'read-top-bar.progression',
      'read-top-bar.actions',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('emits PB-UI-SCENE-v1 status bar with vitals/position children', () => {
    const scene = createReadStatusBarScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('read-status-bar');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'read-status-bar.vitals',
      'read-status-bar.position',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('is deterministic across repeated emission', () => {
    expect(canonicalizePacket(createReadTopBarScene())).toBe(
      canonicalizePacket(createReadTopBarScene()),
    );
    expect(canonicalizePacket(createReadStatusBarScene())).toBe(
      canonicalizePacket(createReadStatusBarScene()),
    );
  });

  it('matches goldens after canonicalize', () => {
    const topGolden = JSON.parse(readFileSync(TOP_FIXTURE, 'utf8'));
    expect(canonicalizePacket(createReadTopBarScene())).toBe(canonicalizePacket(topGolden));

    const statusGolden = JSON.parse(readFileSync(STATUS_FIXTURE, 'utf8'));
    expect(canonicalizePacket(createReadStatusBarScene())).toBe(canonicalizePacket(statusGolden));
  });

  it('removing the harmonic seam leaves the same semantic anatomy', () => {
    const bare = createReadTopBarScene({ includeHarmonicSeam: false });
    expect(validateComposeScene(bare).ok).toBe(true);
    expect(bare.root.visualRefs).toEqual([]);
    expect(Object.keys(bare.visuals)).toEqual([]);
    const withSeam = createReadTopBarScene();
    expect((bare.root.children ?? []).map((c) => c.id)).toEqual(
      (withSeam.root.children ?? []).map((c) => c.id),
    );
  });
});
