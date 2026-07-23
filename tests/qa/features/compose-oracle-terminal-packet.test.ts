// tests/qa/features/compose-oracle-terminal-packet.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  createOracleTerminalScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1 } from '../../../src/core/compose/schema/contracts';

const FIXTURE = join(process.cwd(), 'tests/qa/features/fixtures/oracle-terminal.pb-ui-scene.v1.json');

describe('Oracle terminal PB scene (compose pilot)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
  });

  it('emits PB-UI-SCENE-v1 with session/prompt/signal/feed children', () => {
    const scene = createOracleTerminalScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('oracle-terminal');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'oracle-terminal.session',
      'oracle-terminal.prompt',
      'oracle-terminal.signal',
      'oracle-terminal.feed',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('is deterministic and matches the golden', () => {
    expect(canonicalizePacket(createOracleTerminalScene())).toBe(
      canonicalizePacket(createOracleTerminalScene()),
    );
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    expect(canonicalizePacket(createOracleTerminalScene())).toBe(
      canonicalizePacket(golden),
    );
  });

  it('removing the scanline atmosphere leaves the same semantic anatomy', () => {
    const bare = createOracleTerminalScene({ includeScanlineAtmosphere: false });
    expect(validateComposeScene(bare).ok).toBe(true);
    expect(bare.root.visualRefs).toEqual([]);
    expect(Object.keys(bare.visuals)).toEqual([]);
    expect((bare.root.children ?? []).map((c) => c.id)).toEqual(
      (createOracleTerminalScene().root.children ?? []).map((c) => c.id),
    );
  });
});
